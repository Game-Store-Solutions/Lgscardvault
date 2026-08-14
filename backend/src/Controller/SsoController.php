<?php

namespace App\Controller;

use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\Auth\OidcClient;
use App\Service\Mail\TransactionalMailer;
use App\Service\Payments\SignedOAuthState;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;

/**
 * OpenID Connect single sign-on. All routes are public (the point is to log in).
 * Flow: SPA hits /start → we redirect to the provider → provider redirects back
 * to /callback → we mint a JWT and bounce to the SPA with it.
 */
#[Route('/api/auth/sso')]
class SsoController extends AbstractController
{
    private const STATE_PROVIDER = 'oidc';

    public function __construct(
        private readonly OidcClient $oidc,
        private readonly UserRepository $userRepository,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly JWTTokenManagerInterface $jwtManager,
        private readonly SignedOAuthState $state,
        private readonly LoggerInterface $logger,
        private readonly TransactionalMailer $mail,
    ) {
    }

    #[Route('/status', name: 'api_sso_status', methods: ['GET'])]
    public function status(): JsonResponse
    {
        return $this->json([
            'configured' => $this->oidc->isConfigured(),
            'providerName' => $this->oidc->providerName(),
        ]);
    }

    #[Route('/start', name: 'api_sso_start', methods: ['GET'])]
    public function start(): RedirectResponse
    {
        if (!$this->oidc->isConfigured()) {
            return new RedirectResponse($this->frontendUrl().'/login?sso=unconfigured');
        }

        $redirectUri = $this->generateUrl('api_sso_callback', [], UrlGeneratorInterface::ABSOLUTE_URL);
        $state = $this->state->create(self::STATE_PROVIDER, '', 0);

        return new RedirectResponse($this->oidc->authorizationUrl($redirectUri, $state));
    }

    #[Route('/callback', name: 'api_sso_callback', methods: ['GET'])]
    public function callback(Request $request): RedirectResponse
    {
        $code = (string) $request->query->get('code', '');
        $state = (string) $request->query->get('state', '');

        try {
            if (self::STATE_PROVIDER !== $this->state->verify($state)['provider']) {
                throw new \RuntimeException('Unexpected SSO state.');
            }
            if ('' === $code) {
                throw new \RuntimeException('SSO authorization was cancelled.');
            }

            $redirectUri = $this->generateUrl('api_sso_callback', [], UrlGeneratorInterface::ABSOLUTE_URL);
            $accessToken = $this->oidc->exchangeCode($code, $redirectUri);
            $profile = $this->oidc->fetchUserInfo($accessToken);

            $user = $this->findOrCreateUser($profile['email'], $profile['name']);
            $token = $this->jwtManager->create($user);

            // Fragment, not query string: fragments never reach server/proxy
            // logs or Referer headers, so the JWT stays in the browser.
            return new RedirectResponse($this->frontendUrl().'/auth/sso/callback#token='.rawurlencode($token));
        } catch (\Throwable $e) {
            $this->logger->error('SSO callback failed.', ['error' => $e->getMessage()]);

            return new RedirectResponse($this->frontendUrl().'/login?sso=failed');
        }
    }

    private function findOrCreateUser(string $email, string $displayName): User
    {
        $user = $this->userRepository->findOneBy(['email' => $email]);
        if ($user instanceof User) {
            return $user;
        }

        $user = (new User())
            ->setEmail($email)
            ->setDisplayName($displayName)
            ->setRoles(['ROLE_USER']);
        // SSO users have no local password; store an unguessable random hash so
        // the column is satisfied and password login is effectively disabled.
        $user->setPassword($this->passwordHasher->hashPassword($user, bin2hex(random_bytes(32))));

        $this->userRepository->save($user, true);

        try {
            $this->mail->sendWelcome($user);
        } catch (\Throwable $e) {
            $this->logger->error('Welcome email failed after SSO signup.', [
                'user' => $user->getId(),
                'error' => $e->getMessage(),
            ]);
        }

        return $user;
    }

    private function frontendUrl(): string
    {
        $url = trim((string) ($_ENV['APP_FRONTEND_URL'] ?? $_SERVER['APP_FRONTEND_URL'] ?? ''));

        return rtrim('' !== $url ? $url : 'http://localhost:5173', '/');
    }
}
