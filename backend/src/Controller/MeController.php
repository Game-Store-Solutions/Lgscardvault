<?php

namespace App\Controller;

use App\Entity\User;
use App\Repository\OrderRepository;
use App\Repository\StoreRepository;
use App\Service\Order\CustomerOrderPagination;
use App\Service\Order\CustomerOrderSerializer;
use App\Service\Payments\CustomerPaymentProfileSync;
use App\Service\Payments\SubscriptionBillingInterface;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * The signed-in user's own account: profile read/update, password change,
 * and account deletion. Everything here operates strictly on getUser() —
 * no ids are accepted, so one account can never touch another.
 */
#[Route('/api')]
class MeController extends AbstractController
{
    private const URL_PATTERN = '#^(https?://|/)#';
    private const MIN_PASSWORD_LENGTH = 8;

    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly StoreRepository $storeRepository,
        private readonly OrderRepository $orderRepository,
        private readonly CustomerOrderSerializer $customerOrderSerializer,
        private readonly SubscriptionBillingInterface $billing,
        private readonly CustomerPaymentProfileSync $paymentProfileSync,
    ) {
    }

    #[Route('/me', name: 'api_me', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function me(): JsonResponse
    {
        return $this->json($this->serializeMe($this->requireUser()));
    }

    /** Update own profile: display name and avatar URL. */
    #[Route('/me', name: 'api_me_update', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function update(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        if (array_key_exists('displayName', $payload)) {
            $name = trim((string) $payload['displayName']);
            if ('' === $name) {
                return $this->json(['detail' => 'Display name cannot be empty.'], 422);
            }
            $user->setDisplayName(mb_substr($name, 0, 255));
        }

        if (array_key_exists('avatarUrl', $payload)) {
            $url = trim((string) ($payload['avatarUrl'] ?? ''));
            if ('' === $url) {
                $user->setAvatarUrl(null);
            } elseif (1 === preg_match(self::URL_PATTERN, $url)) {
                $user->setAvatarUrl(mb_substr($url, 0, 1024));
            } else {
                return $this->json(['detail' => 'avatarUrl must be an http(s) URL or a path starting with "/".'], 422);
            }
        }

        $this->entityManager->flush();

        return $this->json($this->serializeMe($user));
    }

    /**
     * Stores where this customer has any activity, newest first — the
     * query lives in StoreRepository::findWithActivityForUser.
     */
    #[Route('/me/stores', name: 'api_me_stores', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function myStores(): JsonResponse
    {
        return $this->json($this->storeRepository->findWithActivityForUser($this->requireUser()));
    }

    /** All orders placed with this account's email, every store, newest first. */
    #[Route('/me/orders', name: 'api_me_orders', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function myOrders(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $email = $user->getEmail();
        if (null === $email || '' === trim($email)) {
            return $this->json([
                'items' => [],
                'total' => 0,
                'page' => 1,
                'itemsPerPage' => CustomerOrderPagination::DEFAULT_ITEMS_PER_PAGE,
            ]);
        }

        $pagination = CustomerOrderPagination::fromRequest($request);
        $orders = $this->orderRepository->findPageByCustomerEmail(
            $email,
            $pagination['offset'],
            $pagination['itemsPerPage'],
        );
        $total = $this->orderRepository->countByCustomerEmail($email);

        return CustomerOrderPagination::toJson(
            $orders,
            $total,
            $pagination['page'],
            $pagination['itemsPerPage'],
            $this->customerOrderSerializer,
        );
    }

    #[Route('/me/payment-config', name: 'api_me_payment_config', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function paymentConfig(): JsonResponse
    {
        return $this->json($this->billing->clientConfig());
    }

    #[Route('/me/payment-method', name: 'api_me_payment_method', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function savePaymentMethod(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        $methodType = (string) ($payload['methodType'] ?? '');
        $sourceId = trim((string) ($payload['token'] ?? ''));
        $verificationToken = trim((string) ($payload['verificationToken'] ?? ''));
        if ('' === $verificationToken) {
            $verificationToken = null;
        }

        if (!in_array($methodType, SubscriptionBillingInterface::METHODS, true)) {
            return $this->json(['detail' => 'Choose a valid payment method.'], 422);
        }
        if ('' === $sourceId) {
            return $this->json(['detail' => 'Payment could not be verified. Please try again.'], 422);
        }

        try {
            $vault = $this->billing->vaultShopperPaymentMethod(
                $sourceId,
                [
                    'email' => $user->getEmail(),
                    'name' => $user->getDisplayName(),
                    'reference' => 'user-'.$user->getId(),
                ],
                $user->getPaymentCustomerId(),
                $user->getPaymentCardId(),
                $verificationToken,
            );
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 402);
        }

        $user
            ->setPaymentCustomerId($vault['customerId'])
            ->setPaymentCardId($vault['cardId'])
            ->setPaymentMethodType($methodType)
            ->setPaymentBrand($vault['brand'])
            ->setPaymentLast4($vault['last4'])
            ->setPaymentExpires($this->formatCardExpiry($vault['expMonth'], $vault['expYear']));

        $this->paymentProfileSync->syncUserToAllStoreProfiles($user);
        $this->entityManager->flush();

        return $this->json($this->serializeMe($user));
    }

    /** Change own password; requires the current password. */
    #[Route('/me/password', name: 'api_me_password', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function changePassword(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $payload = json_decode($request->getContent(), true);
        $current = is_array($payload) ? (string) ($payload['currentPassword'] ?? '') : '';
        $new = is_array($payload) ? (string) ($payload['newPassword'] ?? '') : '';

        if (!$this->passwordHasher->isPasswordValid($user, $current)) {
            return $this->json(['detail' => 'Current password is incorrect.'], 422);
        }
        if (mb_strlen($new) < self::MIN_PASSWORD_LENGTH) {
            return $this->json(['detail' => sprintf('New password must be at least %d characters.', self::MIN_PASSWORD_LENGTH)], 422);
        }

        $user->setPassword($this->passwordHasher->hashPassword($user, $new));
        $this->entityManager->flush();

        return $this->json(['detail' => 'Password updated.']);
    }

    /**
     * Delete own account (password-confirmed). Store owners must transfer or
     * delete their stores first — a storefront silently vanishing with its
     * inventory, orders, and customers is not a one-click decision.
     * Customer-side rows (carts, favorites, want lists, notifications)
     * cascade away at the database level.
     */
    #[Route('/me', name: 'api_me_delete', methods: ['DELETE'])]
    #[IsGranted('ROLE_USER')]
    public function deleteAccount(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $payload = json_decode($request->getContent(), true);
        $password = is_array($payload) ? (string) ($payload['password'] ?? '') : '';

        if (!$this->passwordHasher->isPasswordValid($user, $password)) {
            return $this->json(['detail' => 'Password is incorrect.'], 422);
        }

        // Count in the database rather than trusting the lazy collection — a
        // freshly-persisted entity's inverse side can be stale in-memory.
        if ($this->storeRepository->count(['owner' => $user]) > 0) {
            return $this->json([
                'detail' => 'You still own a store. Transfer or delete your stores before deleting your account.',
            ], 409);
        }

        $this->entityManager->remove($user);
        $this->entityManager->flush();

        return $this->json(null, 204);
    }

    private function requireUser(): User
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        return $user;
    }

    /** @return array<string, mixed> */
    private function serializeMe(User $user): array
    {
        $ownedStores = [];
        foreach ($user->getOwnedStores() as $store) {
            $ownedStores[] = [
                'id' => $store->getId(),
                'name' => $store->getName(),
                'slug' => $store->getSlug(),
            ];
        }

        return [
            'id' => $user->getId(),
            'email' => $user->getEmail(),
            'displayName' => $user->getDisplayName(),
            'avatarUrl' => $user->getAvatarUrl(),
            'roles' => $user->getRoles(),
            'ownedStores' => $ownedStores,
            'paymentBrand' => $user->getPaymentBrand(),
            'paymentLast4' => $user->getPaymentLast4(),
            'paymentExpires' => $user->getPaymentExpires(),
            'paymentMethodType' => $user->getPaymentMethodType(),
            'paymentConfigured' => null !== $user->getPaymentCardId() && '' !== $user->getPaymentCardId(),
        ];
    }

    private function formatCardExpiry(?string $month, ?string $year): ?string
    {
        if (null === $month || '' === $month || null === $year || '' === $year) {
            return null;
        }

        $monthInt = (int) $month;
        if ($monthInt < 1 || $monthInt > 12) {
            return null;
        }

        $yearStr = (string) $year;
        $yy = strlen($yearStr) <= 2 ? $yearStr : substr($yearStr, -2);

        return sprintf('%02d/%s', $monthInt, $yy);
    }
}
