<?php

namespace App\Controller;

use App\Entity\CustomerNotification;
use App\Entity\Game;
use App\Entity\Store;
use App\Entity\User;
use App\Repository\CustomerFavoriteRepository;
use App\Repository\CustomerNotificationRepository;
use App\Repository\CustomerWantListEntryRepository;
use App\Repository\GameRepository;
use App\Repository\OrderRepository;
use App\Repository\SellSubmissionRepository;
use App\Repository\StoreCreditTransactionRepository;
use App\Repository\StoreCustomerRepository;
use App\Repository\StoreRepository;
use App\Repository\StoreStaffRepository;
use App\Service\Customer\ActivityListPagination;
use App\Service\Customer\MarketplaceActivitySerializer;
use App\Service\Customer\SellTradeDraftService;
use App\Service\Customer\SetAlertBook;
use App\Service\Credit\StoreCreditLedger;
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
    private const HEX_PATTERN = '/^#[0-9A-Fa-f]{6}$/';
    private const MIN_PASSWORD_LENGTH = 8;

    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly StoreRepository $storeRepository,
        private readonly OrderRepository $orderRepository,
        private readonly CustomerOrderSerializer $customerOrderSerializer,
        private readonly SubscriptionBillingInterface $billing,
        private readonly CustomerPaymentProfileSync $paymentProfileSync,
        private readonly CustomerWantListEntryRepository $wantListRepository,
        private readonly CustomerFavoriteRepository $favoriteRepository,
        private readonly CustomerNotificationRepository $notificationRepository,
        private readonly SellSubmissionRepository $sellSubmissionRepository,
        private readonly StoreCustomerRepository $storeCustomerRepository,
        private readonly SellTradeDraftService $sellTradeDraftService,
        private readonly StoreCreditTransactionRepository $creditTransactions,
        private readonly StoreCreditLedger $creditLedger,
        private readonly MarketplaceActivitySerializer $activitySerializer,
        private readonly StoreStaffRepository $staffRepository,
        private readonly SetAlertBook $setAlertBook,
        private readonly GameRepository $gameRepository,
    ) {
    }

    #[Route('/me', name: 'api_me', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function me(): JsonResponse
    {
        return $this->json($this->serializeMe($this->requireUser()));
    }

    /** Update own profile: name, avatar, and cover. */
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
            $error = $this->applyPublicUrl($payload['avatarUrl'], 'avatarUrl');
            if (null !== $error) {
                return $error;
            }
            $user->setAvatarUrl($this->normalizePublicUrl($payload['avatarUrl']));
        }

        if (array_key_exists('coverImageUrl', $payload)) {
            $error = $this->applyPublicUrl($payload['coverImageUrl'], 'coverImageUrl');
            if (null !== $error) {
                return $error;
            }
            $user->setCoverImageUrl($this->normalizePublicUrl($payload['coverImageUrl']));
        }

        if (array_key_exists('coverColor', $payload)) {
            $color = $this->normalizeCoverColor($payload['coverColor']);
            if (false === $color) {
                return $this->json(['detail' => 'coverColor must be a 6-digit hex color, e.g. #0a1627.'], 422);
            }
            $user->setCoverColor($color);
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
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }
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
            $store,
        );
        $total = $this->orderRepository->countByCustomerEmail($email, $store);

        return CustomerOrderPagination::toJson(
            $orders,
            $total,
            $pagination['page'],
            $pagination['itemsPerPage'],
            $this->customerOrderSerializer,
        );
    }

    /** Want-list rows across every store this shopper has listed a card at. */
    #[Route('/me/want-list', name: 'api_me_want_list', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function myWantList(Request $request): JsonResponse
    {
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }

        $pagination = ActivityListPagination::fromRequest($request);
        $user = $this->requireUser();

        return $this->json(ActivityListPagination::payload(
            array_map(
                $this->activitySerializer->wantListEntry(...),
                $this->wantListRepository->findForUser($user, $store, $pagination['offset'], $pagination['itemsPerPage']),
            ),
            $this->wantListRepository->countForUser($user, $store),
            $pagination,
        ));
    }

    /** Saved listings across every store. */
    #[Route('/me/favorites', name: 'api_me_favorites', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function myFavorites(Request $request): JsonResponse
    {
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }

        $pagination = ActivityListPagination::fromRequest($request);
        $user = $this->requireUser();

        return $this->json(ActivityListPagination::payload(
            array_map(
                $this->activitySerializer->favorite(...),
                $this->favoriteRepository->findForUser($user, $store, $pagination['offset'], $pagination['itemsPerPage']),
            ),
            $this->favoriteRepository->countForUser($user, $store),
            $pagination,
        ));
    }

    /** Notifications from every store, newest first. */
    #[Route('/me/notifications', name: 'api_me_notifications', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function myNotifications(Request $request): JsonResponse
    {
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }

        $pagination = ActivityListPagination::fromRequest($request);
        $user = $this->requireUser();
        $payload = ActivityListPagination::payload(
            array_map(
                $this->activitySerializer->notification(...),
                $this->notificationRepository->findForUser($user, $store, $pagination['itemsPerPage'], $pagination['offset']),
            ),
            $this->notificationRepository->countForUser($user, $store),
            $pagination,
        );
        $payload['unread'] = $this->notificationRepository->countUnreadForUser($user, $store);

        return $this->json($payload);
    }

    #[Route('/me/notifications/read-all', name: 'api_me_notifications_read_all', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function markMyNotificationsRead(Request $request): JsonResponse
    {
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }

        $read = $this->notificationRepository->markAllReadForUser(
            $this->requireUser(),
            $store,
            $this->notificationTypesFromRequest($request),
        );

        return $this->json(['read' => $read]);
    }

    #[Route('/me/notifications/{id}/read', name: 'api_me_notification_read', methods: ['PATCH'], requirements: ['id' => '\\d+'])]
    #[IsGranted('ROLE_USER')]
    public function markMyNotificationRead(int $id): JsonResponse
    {
        $user = $this->requireUser();
        $notification = $this->notificationRepository->find($id);
        if (!$notification instanceof CustomerNotification || $notification->getUser()?->getId() !== $user->getId()) {
            return $this->json(['detail' => 'Notification not found.'], 404);
        }

        $notification->markRead();
        $this->entityManager->flush();

        return $this->json($this->activitySerializer->notification($notification));
    }

    /** Store + set restock watches for the signed-in shopper. */
    #[Route('/me/set-alerts', name: 'api_me_set_alerts', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function mySetAlerts(Request $request): JsonResponse
    {
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }

        $pagination = ActivityListPagination::fromRequest($request);
        $user = $this->requireUser();

        return $this->json(ActivityListPagination::payload(
            array_map(
                $this->setAlertBook->serialize(...),
                $this->setAlertBook->list($user, $store, $pagination['offset'], $pagination['itemsPerPage']),
            ),
            $this->setAlertBook->count($user, $store),
            $pagination,
        ));
    }

    #[Route('/me/set-alerts', name: 'api_me_set_alerts_create', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function createSetAlert(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);
        if (!\is_array($payload)) {
            return $this->json(['detail' => 'Invalid payload.'], 422);
        }

        $store = $this->storeRepository->findOneBySlug(trim((string) ($payload['store'] ?? '')));
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $game = $this->gameRepository->findOneByCode((string) ($payload['game'] ?? ''));
        if (!$game instanceof Game) {
            return $this->json(['detail' => 'Unknown game.'], 422);
        }

        try {
            $alert = $this->setAlertBook->subscribe(
                $this->requireUser(),
                $store,
                $game,
                (string) ($payload['setCode'] ?? ''),
            );
        } catch (\InvalidArgumentException $exception) {
            return $this->json(['detail' => $exception->getMessage()], 422);
        }

        $created = null === $alert->getId();
        $this->entityManager->flush();

        return $this->json($this->setAlertBook->serialize($alert), $created ? 201 : 200);
    }

    #[Route('/me/set-alerts/{id}', name: 'api_me_set_alerts_delete', methods: ['DELETE'], requirements: ['id' => '\\d+'])]
    #[IsGranted('ROLE_USER')]
    public function deleteSetAlert(int $id): JsonResponse
    {
        if (!$this->setAlertBook->unsubscribe($this->requireUser(), $id)) {
            return $this->json(['detail' => 'Set alert not found.'], 404);
        }

        $this->entityManager->flush();

        return $this->json(null, 204);
    }

    /** Sell/trade submissions across stores. */
    #[Route('/me/sell-submissions', name: 'api_me_sell_submissions', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function mySellSubmissions(Request $request): JsonResponse
    {
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }

        $pagination = ActivityListPagination::fromRequest($request);
        $user = $this->requireUser();

        return $this->json(ActivityListPagination::payload(
            array_map(
                $this->activitySerializer->sellSubmission(...),
                $this->sellSubmissionRepository->findForUser($user, $store, $pagination['offset'], $pagination['itemsPerPage']),
            ),
            $this->sellSubmissionRepository->countForUser($user, $store),
            $pagination,
        ));
    }

    /** In-progress sell/trade drafts across stores (not yet submitted). */
    #[Route('/me/sell-trade-drafts', name: 'api_me_sell_trade_drafts', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function mySellTradeDrafts(Request $request): JsonResponse
    {
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }

        $user = $this->requireUser();
        $items = [];
        foreach ($this->storeCustomerRepository->findWithSellTradeDraftsForUser($user, $store) as $customer) {
            $rowStore = $customer->getStore();
            if (!$rowStore instanceof Store) {
                continue;
            }
            $draft = $this->sellTradeDraftService->hydrate($customer->getSellTradeDraft(), $rowStore);
            if (null === $draft || [] === ($draft['lines'] ?? [])) {
                continue;
            }
            $cardCount = 0;
            foreach ($draft['lines'] as $line) {
                $cardCount += (int) ($line['quantity'] ?? 0);
            }
            $items[] = [
                'storeSlug' => $rowStore->getSlug(),
                'storeName' => $rowStore->getName(),
                'payoutMethod' => $draft['payoutMethod'],
                'gameFilter' => $draft['gameFilter'],
                'cardCount' => $cardCount,
                'lineCount' => \count($draft['lines']),
                'updatedAt' => $customer->getUpdatedAt()->format(DATE_ATOM),
                'lines' => $draft['lines'],
            ];
        }

        return $this->json(['items' => $items]);
    }

    /**
     * Store-credit balances. With ?store=slug, also returns that store's ledger.
     *
     * @return JsonResponse
     */
    #[Route('/me/credit', name: 'api_me_credit', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function myCredit(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $store = $this->optionalStore($request);
        if ($store instanceof JsonResponse) {
            return $store;
        }

        if ($store instanceof Store) {
            $pagination = ActivityListPagination::fromRequest($request);

            return $this->json([
                'storeSlug' => $store->getSlug(),
                'storeName' => $store->getName(),
                'balanceCents' => $this->creditLedger->balance($user, $store),
                'transactions' => ActivityListPagination::payload(
                    array_map(
                        $this->activitySerializer->creditTransaction(...),
                        $this->creditTransactions->historyFor($user, $store, $pagination['itemsPerPage'], $pagination['offset']),
                    ),
                    $this->creditTransactions->countHistoryFor($user, $store),
                    $pagination,
                ),
            ]);
        }

        $rows = $this->creditTransactions->balancesForUser($user);
        $ids = array_column($rows, 'storeId');
        $stores = [] === $ids ? [] : $this->storeRepository->findBy(['id' => $ids]);
        $byId = [];
        foreach ($stores as $rowStore) {
            $byId[$rowStore->getId()] = $rowStore;
        }

        $balances = [];
        foreach ($rows as $row) {
            $rowStore = $byId[$row['storeId']] ?? null;
            if (!$rowStore instanceof Store) {
                continue;
            }
            $balances[] = [
                'storeSlug' => $rowStore->getSlug(),
                'storeName' => $rowStore->getName(),
                'balanceCents' => $row['balanceCents'],
            ];
        }

        return $this->json(['balances' => $balances]);
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
        $user->clearPasswordReset();
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

    /** @return JsonResponse|null 422 when the URL is present but not http(s) or site-relative */
    private function applyPublicUrl(mixed $raw, string $field): ?JsonResponse
    {
        $url = trim((string) ($raw ?? ''));
        if ('' === $url || 1 === preg_match(self::URL_PATTERN, $url)) {
            return null;
        }

        return $this->json(['detail' => $field.' must be an http(s) URL or a path starting with "/".'], 422);
    }

    private function normalizePublicUrl(mixed $raw): ?string
    {
        $url = trim((string) ($raw ?? ''));

        return '' === $url ? null : mb_substr($url, 0, 1024);
    }

    /**
     * Empty string clears the tint. Invalid hex is false so the caller can 422.
     *
     * @return string|null|false
     */
    private function normalizeCoverColor(mixed $raw): string|false|null
    {
        $value = trim((string) ($raw ?? ''));
        if ('' === $value) {
            return null;
        }
        if (!str_starts_with($value, '#')) {
            $value = '#'.$value;
        }
        if (1 !== preg_match(self::HEX_PATTERN, $value)) {
            return false;
        }

        return strtolower($value);
    }

    /**
     * Optional `?store=slug` filter. Returns a 404 JsonResponse when the slug
     * is present but unknown; null when the caller wants every store.
     */
    private function optionalStore(Request $request): Store|JsonResponse|null
    {
        $slug = trim((string) $request->query->get('store', ''));
        if ('' === $slug) {
            return null;
        }

        $store = $this->storeRepository->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $store;
    }

    /**
     * Optional `?type=order_fulfilled` (repeatable) so opening Orders can
     * clear only order alerts without wiping sell/trade or want-list notices.
     *
     * @return list<string>|null
     */
    private function notificationTypesFromRequest(Request $request): ?array
    {
        $raw = $request->query->all()['type'] ?? null;
        if (is_string($raw)) {
            $raw = [$raw];
        }
        if (!is_array($raw) || [] === $raw) {
            return null;
        }

        $types = [];
        foreach ($raw as $value) {
            if (is_string($value) && in_array($value, CustomerNotification::TYPES, true)) {
                $types[] = $value;
            }
        }

        return [] === $types ? null : array_values(array_unique($types));
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

        $managedStores = [];
        foreach ($this->staffRepository->findAdminMemberships($user) as $membership) {
            $store = $membership->getStore();
            if (null === $store) {
                continue;
            }
            $managedStores[] = [
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
            'coverImageUrl' => $user->getCoverImageUrl(),
            'coverColor' => $user->getCoverColor(),
            'roles' => $user->getRoles(),
            'emailVerified' => $user->isEmailVerified(),
            'ageVerified' => $user->isAgeVerified(),
            'ownedStores' => $ownedStores,
            'managedStores' => $managedStores,
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
