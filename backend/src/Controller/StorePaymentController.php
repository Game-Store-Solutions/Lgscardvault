<?php

namespace App\Controller;

use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Entity\User;
use App\Repository\StorePaymentAccountRepository;
use App\Repository\StoreRepository;
use App\Repository\UserRepository;
use App\Service\Payments\SignedOAuthState;
use App\Service\Payments\SquareOAuthClient;
use App\Service\Payments\StoreCheckoutGateway;
use App\Service\Security\SecretCipher;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class StorePaymentController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly StorePaymentAccountRepository $paymentAccountRepository,
        private readonly EntityManagerInterface $entityManager,
        private readonly SignedOAuthState $oauthState,
        private readonly SquareOAuthClient $squareOAuthClient,
        private readonly StoreCheckoutGateway $checkoutGateway,
        private readonly SecretCipher $secretCipher,
        private readonly UserRepository $userRepository,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/api/stores/{slug}/payments', name: 'api_store_payments_status', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function status(string $slug): JsonResponse
    {
        $store = $this->resolveManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json([
            'square' => $this->serializeAccount(
                $this->paymentAccountRepository->findOneForStoreAndProvider($store, StorePaymentAccount::PROVIDER_SQUARE),
            ),
        ]);
    }

    #[Route('/api/stores/{slug}/payments/square/connect', name: 'api_store_payments_square_connect', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function squareConnect(string $slug): JsonResponse
    {
        $store = $this->resolveManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User || null === $user->getId()) {
            return $this->json(['detail' => 'Authentication required.'], 401);
        }

        if (!$this->squareOAuthClient->isConfigured()) {
            return $this->json(['detail' => 'Square OAuth is not configured.'], 422);
        }

        $redirectUri = $this->squareOAuthRedirectUri();
        $state = $this->oauthState->create(
            StorePaymentAccount::PROVIDER_SQUARE,
            $store->getSlug() ?? $slug,
            $user->getId(),
            redirectUri: $redirectUri,
        );

        return $this->json([
            'authorizationUrl' => $this->squareOAuthClient->authorizationUrl($redirectUri, $state),
            'environment' => $this->squareOAuthClient->environment(),
            'scopes' => $this->squareOAuthClient->scopes(),
        ]);
    }

    #[Route('/api/stores/{slug}/payments/square/disconnect', name: 'api_store_payments_square_disconnect', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function squareDisconnect(string $slug): JsonResponse
    {
        $store = $this->resolveManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $account = $this->paymentAccountRepository->findOneForStoreAndProvider($store, StorePaymentAccount::PROVIDER_SQUARE);
        if (!$account instanceof StorePaymentAccount) {
            return $this->json(['square' => null]);
        }

        try {
            $accessToken = $this->secretCipher->decrypt($account->getAccessTokenEncrypted()) ?? '';
            $this->squareOAuthClient->revoke($accessToken);
        } catch (\Throwable $e) {
            $account->setLastError($e->getMessage());
        }

        $account->markDisconnected();
        $this->entityManager->flush();

        return $this->json(['square' => $this->serializeAccount($account)]);
    }

    #[Route('/api/integrations/square/callback', name: 'api_square_oauth_callback', methods: ['GET'])]
    public function squareCallback(Request $request): RedirectResponse
    {
        $state = (string) $request->query->get('state', '');
        $code = (string) $request->query->get('code', '');
        $error = (string) $request->query->get('error', '');
        $storeSlug = '';

        try {
            $payload = $this->oauthState->verify($state);
            $storeSlug = $payload['storeSlug'];

            if (StorePaymentAccount::PROVIDER_SQUARE !== $payload['provider']) {
                throw new \RuntimeException('Unexpected OAuth provider.');
            }

            if ('' !== $error || '' === $code) {
                throw new \RuntimeException('Square authorization was cancelled or denied.');
            }

            $store = $this->storeRepository->findOneBySlug($storeSlug);
            if (!$store instanceof Store) {
                throw new \RuntimeException('Store authorization could not be verified.');
            }

            $initiator = $this->userRepository->find($payload['userId']);
            if (!$initiator instanceof User || !$this->canCompleteSquareOAuth($initiator, $store)) {
                throw new \RuntimeException('Store authorization could not be verified.');
            }

            $redirectUri = '' !== ($payload['redirectUri'] ?? '') ? $payload['redirectUri'] : $this->squareOAuthRedirectUri();
            $token = $this->squareOAuthClient->obtainToken($code, $redirectUri);

            if ('' === $token['accessToken']) {
                throw new \RuntimeException('Square did not return an access token.');
            }

            $account = $this->paymentAccountRepository->getOrCreateForStoreAndProvider($store, StorePaymentAccount::PROVIDER_SQUARE);
            $account
                ->setEnvironment($this->squareOAuthClient->environment())
                ->setProviderMerchantId($token['merchantId'])
                ->setAccessTokenEncrypted($this->secretCipher->encrypt($token['accessToken']))
                ->setRefreshTokenEncrypted($this->secretCipher->encrypt($token['refreshToken']))
                ->setScopes($this->squareOAuthClient->scopes())
                ->setTokenExpiresAt($token['expiresAt'])
                ->markConnected();

            if (null === $account->getId()) {
                $this->entityManager->persist($account);
            }
            $this->entityManager->flush();

            // OAuth never returns a location, but checkout cannot run without
            // one. A failure here is recoverable — the gateway retries lazily.
            $this->checkoutGateway->syncLocation($account);

            return $this->redirectToAdminPayments($storeSlug, 'connected');
        } catch (\Throwable $e) {
            $this->logger->warning('Square OAuth callback failed', [
                'storeSlug' => $storeSlug,
                'error' => $e->getMessage(),
            ]);

            return $this->redirectToAdminPayments($storeSlug, 'error');
        }
    }

    private function canCompleteSquareOAuth(User $user, Store $store): bool
    {
        if ($store->getOwner()?->getId() === $user->getId()) {
            return true;
        }

        return in_array('ROLE_SUPER_ADMIN', $user->getRoles(), true);
    }

    private function squareOAuthRedirectUri(): string
    {
        $configured = trim((string) ($_ENV['SQUARE_OAUTH_REDIRECT_URI'] ?? $_SERVER['SQUARE_OAUTH_REDIRECT_URI'] ?? ''));
        if ('' !== $configured) {
            return $configured;
        }

        return $this->generateUrl('api_square_oauth_callback', [], UrlGeneratorInterface::ABSOLUTE_URL);
    }

    private function resolveManagedStore(string $slug): ?Store
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return null;
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $store;
    }

    /** @return array<string, mixed>|null */
    private function serializeAccount(?StorePaymentAccount $account): ?array
    {
        if (!$account instanceof StorePaymentAccount) {
            return null;
        }

        return [
            'provider' => $account->getProvider(),
            'status' => $account->getStatus(),
            'environment' => $account->getEnvironment(),
            'merchantId' => $account->getProviderMerchantId(),
            'locationId' => $account->getProviderLocationId(),
            'scopes' => $account->getScopes(),
            'tokenExpiresAt' => $account->getTokenExpiresAt()?->format(DATE_ATOM),
            'connectedAt' => $account->getConnectedAt()?->format(DATE_ATOM),
            'disconnectedAt' => $account->getDisconnectedAt()?->format(DATE_ATOM),
            'lastError' => $account->getLastError(),
        ];
    }

    private function redirectToAdminPayments(string $storeSlug, string $status): RedirectResponse
    {
        $path = '' !== $storeSlug
            ? sprintf('/s/%s/admin/payments?square=%s', rawurlencode($storeSlug), rawurlencode($status))
            : sprintf('/?square=%s', rawurlencode($status));

        return new RedirectResponse($this->frontendUrl().$path);
    }

    private function frontendUrl(): string
    {
        $url = trim((string) ($_ENV['APP_FRONTEND_URL'] ?? $_SERVER['APP_FRONTEND_URL'] ?? ''));

        return rtrim('' !== $url ? $url : 'http://localhost:5173', '/');
    }
}
