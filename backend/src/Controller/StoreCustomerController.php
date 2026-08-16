<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\CartItem;
use App\Entity\CustomerNotification;
use App\Entity\CustomerFavorite;
use App\Entity\CustomerWantListEntry;
use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\SealedInventoryItem;
use App\Entity\Store;
use App\Service\Catalog\FinishVocabulary;
use App\Entity\StoreCustomer;
use App\Entity\User;
use App\Repository\CardRepository;
use App\Repository\CartItemRepository;
use App\Repository\CustomerNotificationRepository;
use App\Repository\CustomerFavoriteRepository;
use App\Repository\CustomerWantListEntryRepository;
use App\Repository\InventoryItemRepository;
use App\Repository\OrderRepository;
use App\Repository\StoreCustomerRepository;
use App\Repository\StoreRepository;
use App\Enum\OrderStatus;
use App\Service\Checkout\CartOrderBuilder;
use App\Service\Checkout\OrderStockReleaser;
use App\Service\Checkout\OutOfStockException;
use App\Service\Order\CustomerOrderPagination;
use App\Service\Order\CustomerOrderSerializer;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Service\Payments\CustomerPaymentProfileSync;
use App\Service\Payments\SubscriptionBillingInterface;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\KernelInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/stores/{slug}/customer')]
#[IsGranted('ROLE_USER')]
final class StoreCustomerController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly StoreCustomerRepository $customerRepository,
        private readonly CustomerNotificationRepository $notificationRepository,
        private readonly CustomerFavoriteRepository $favoriteRepository,
        private readonly CustomerWantListEntryRepository $wantListRepository,
        private readonly CartItemRepository $cartRepository,
        private readonly \App\Repository\SealedInventoryItemRepository $sealedInventoryItems,
        private readonly \App\Service\Catalog\GameCatalogSerializer $catalogSerializer,
        private readonly InventoryItemRepository $inventoryRepository,
        private readonly CardRepository $cardRepository,
        private readonly OrderRepository $orderRepository,
        private readonly CustomerOrderSerializer $customerOrderSerializer,
        private readonly \App\Service\Credit\StoreCreditLedger $creditLedger,
        private readonly CartOrderBuilder $orderBuilder,
        private readonly OrderStockReleaser $stockReleaser,
        private readonly CheckoutGatewayInterface $checkoutGateway,
        private readonly CustomerPaymentProfileSync $paymentProfileSync,
        private readonly EntityManagerInterface $entityManager,
        private readonly KernelInterface $kernel,
    ) {
    }

    #[Route('', name: 'api_store_customer_show', methods: ['GET'])]
    public function show(string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        // A GET must never mutate state: if the customer row does not exist yet,
        // return a default/empty representation instead of persisting one.
        $customer = $this->findCustomer($store);
        if (!$customer instanceof StoreCustomer) {
            $user = $this->getUser();
            if ($user instanceof User && null !== $user->getPaymentLast4() && '' !== $user->getPaymentLast4()) {
                return $this->json([
                    ...$this->emptyCustomer(),
                    'paymentBrand' => $user->getPaymentBrand(),
                    'paymentLast4' => $user->getPaymentLast4(),
                    'paymentExpires' => $user->getPaymentExpires(),
                    'paymentMethodType' => $user->getPaymentMethodType(),
                    'paymentConfigured' => true,
                    'savedCardReady' => false,
                ]);
            }

            return $this->json($this->emptyCustomer());
        }

        $user = $this->getUser();
        if ($user instanceof User) {
            return $this->json($this->serializeCustomerForRead($customer, $user));
        }

        return $this->json($this->serializeCustomer($customer));
    }

    #[Route('', name: 'api_store_customer_update', methods: ['PATCH'])]
    public function update(Request $request, string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $payload = $this->jsonPayload($request);

        $error = $this->validatePaymentMetadata($payload);
        if (null !== $error) {
            return $this->json(['detail' => $error], 422);
        }

        // Create-on-write: only this mutation endpoint persists/flushes the row.
        $customer = $this->getOrCreateCustomer($store);
        $customer
            ->setPhone($this->nullableString($payload['phone'] ?? null, 255))
            ->setShippingAddress($this->nullableString($payload['shippingAddress'] ?? null))
            ->setPaymentBrand($this->nullableString($payload['paymentBrand'] ?? null, 40))
            ->setPaymentLast4($this->nullableString($payload['paymentLast4'] ?? null, 4))
            ->setPaymentExpires($this->nullableString($payload['paymentExpires'] ?? null, 7));

        $this->entityManager->flush();

        return $this->json($this->serializeCustomer($customer));
    }

    #[Route('/favorites', name: 'api_store_customer_favorites', methods: ['GET'])]
    public function favorites(string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        // Read-only: no customer row yet means no favorites.
        $customer = $this->findCustomer($store);
        if (!$customer instanceof StoreCustomer) {
            return $this->json([]);
        }

        return $this->json(array_map(
            $this->serializeFavorite(...),
            $this->favoriteRepository->findForCustomer($customer),
        ));
    }

    #[Route('/favorites/{itemId}', name: 'api_store_customer_favorite_add', methods: ['PUT'])]
    public function addFavorite(string $slug, int $itemId): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $customer = $this->getOrCreateCustomer($store);

        $item = $this->findStoreItem($customer, $itemId);
        if (!$item instanceof InventoryItem) {
            return $this->json(['detail' => 'Inventory item not found.'], 404);
        }

        $favorite = $this->favoriteRepository->findOneForCustomerAndItem($customer, $item);
        if (!$favorite instanceof CustomerFavorite) {
            $favorite = (new CustomerFavorite())->setCustomer($customer)->setInventoryItem($item);
            $this->entityManager->persist($favorite);
            $this->entityManager->flush();
        }

        return $this->json($this->serializeFavorite($favorite), 201);
    }

    #[Route('/favorites/{itemId}', name: 'api_store_customer_favorite_remove', methods: ['DELETE'])]
    public function removeFavorite(string $slug, int $itemId): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        // No customer row means nothing to remove — no-op without persisting.
        $customer = $this->findCustomer($store);
        $item = $customer instanceof StoreCustomer ? $this->findStoreItem($customer, $itemId) : null;
        if ($customer instanceof StoreCustomer && $item instanceof InventoryItem) {
            $favorite = $this->favoriteRepository->findOneForCustomerAndItem($customer, $item);
            if ($favorite instanceof CustomerFavorite) {
                $this->entityManager->remove($favorite);
                $this->entityManager->flush();
            }
        }

        return $this->json(null, 204);
    }

    #[Route('/want-list', name: 'api_store_customer_want_list', methods: ['GET'])]
    public function wantList(string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        // Read-only: no customer row yet means an empty want list.
        $customer = $this->findCustomer($store);
        if (!$customer instanceof StoreCustomer) {
            return $this->json([]);
        }

        return $this->json(array_map(
            fn (CustomerWantListEntry $entry) => $this->serializeWantListEntry($store, $entry),
            $this->wantListRepository->findForCustomer($customer),
        ));
    }

    #[Route('/want-list', name: 'api_store_customer_want_list_add', methods: ['POST'])]
    public function addWantListEntry(Request $request, string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $customer = $this->getOrCreateCustomer($store);

        $payload = $this->jsonPayload($request);
        $card = $this->findCard((string) ($payload['cardId'] ?? ''));
        $cardName = trim((string) ($payload['cardName'] ?? $card?->getName() ?? ''));
        if ('' === $cardName) {
            return $this->json(['detail' => 'Card name is required.'], 422);
        }

        $entry = (new CustomerWantListEntry())
            ->setCustomer($customer)
            ->setCard($card)
            ->setCardName(mb_substr($cardName, 0, 255))
            ->setSetCode($this->nullableString($payload['setCode'] ?? $card?->getSetCode(), 120))
            ->setFinish($this->wantedFinish($payload, $card))
            ->setQuantity(max(1, (int) ($payload['quantity'] ?? 1)))
            ->setNotes($this->nullableString($payload['notes'] ?? null, 255));

        $this->entityManager->persist($entry);
        $this->entityManager->flush();

        return $this->json($this->serializeWantListEntry($store, $entry), 201);
    }

    #[Route('/want-list/{id}', name: 'api_store_customer_want_list_remove', methods: ['DELETE'])]
    public function removeWantListEntry(string $slug, int $id): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        // No customer row means nothing to remove — no-op without persisting.
        $customer = $this->findCustomer($store);
        $entry = $customer instanceof StoreCustomer ? $this->wantListRepository->find($id) : null;
        if ($customer instanceof StoreCustomer && $entry instanceof CustomerWantListEntry && $entry->getCustomer()?->getId() === $customer->getId()) {
            $this->entityManager->remove($entry);
            $this->entityManager->flush();
        }

        return $this->json(null, 204);
    }

    #[Route('/cart', name: 'api_store_customer_cart', methods: ['GET'])]
    public function cart(string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        // Read-only: no customer row yet means an empty cart.
        $customer = $this->findCustomer($store);
        if (!$customer instanceof StoreCustomer) {
            return $this->json([]);
        }

        return $this->json(array_map(
            $this->serializeCartItem(...),
            $this->cartRepository->findForCustomer($customer),
        ));
    }

    /**
     * Upsert a cart line. Body: {"quantity": n}. Quantity is clamped to the
     * listing's available stock; 0 (or less) removes the line. Adding without a
     * body defaults to quantity 1.
     */
    #[Route('/cart/{itemId}', name: 'api_store_customer_cart_set', methods: ['PUT'])]
    public function setCartItem(Request $request, string $slug, int $itemId): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $customer = $this->getOrCreateCustomer($store);

        $item = $this->findStoreItem($customer, $itemId);
        if (!$item instanceof InventoryItem) {
            return $this->json(['detail' => 'Inventory item not found.'], 404);
        }

        $payload = $this->jsonPayload($request);
        $requested = (int) ($payload['quantity'] ?? 1);

        $entry = $this->cartRepository->findOneForCustomerAndItem($customer, $item);

        if ($requested <= 0) {
            if ($entry instanceof CartItem) {
                $this->entityManager->remove($entry);
                $this->entityManager->flush();
            }

            return $this->json(null, 204);
        }

        if ($item->getQuantity() < 1) {
            return $this->json(['detail' => 'This listing is out of stock.'], 422);
        }

        $isNew = !$entry instanceof CartItem;
        if ($isNew) {
            $entry = (new CartItem())->setCustomer($customer)->setInventoryItem($item);
            $this->entityManager->persist($entry);
        }

        $entry->setQuantity(min($requested, $item->getQuantity()));
        $this->entityManager->flush();

        return $this->json($this->serializeCartItem($entry), $isNew ? 201 : 200);
    }

    /**
     * Upsert a sealed cart line. Body: {"quantity": n}; 0 removes it.
     * Mirrors the singles route but addresses a sealed listing id.
     */
    #[Route('/cart/sealed/{itemId}', name: 'api_store_customer_cart_sealed_set', methods: ['PUT'], requirements: ['itemId' => '\\d+'])]
    public function setSealedCartItem(Request $request, string $slug, int $itemId): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $customer = $this->getOrCreateCustomer($store);

        $item = $this->sealedInventoryItems->findOneForStore($store, $itemId);
        if (!$item instanceof SealedInventoryItem) {
            return $this->json(['detail' => 'Sealed listing not found.'], 404);
        }

        $payload = $this->jsonPayload($request);
        $requested = (int) ($payload['quantity'] ?? 1);
        $entry = $this->cartRepository->findOneForCustomerAndSealedItem($customer, $item);

        if ($requested <= 0) {
            if ($entry instanceof CartItem) {
                $this->entityManager->remove($entry);
                $this->entityManager->flush();
            }

            return $this->json(null, 204);
        }

        if ($item->getQuantity() < 1) {
            return $this->json(['detail' => 'This sealed product is out of stock.'], 422);
        }

        $isNew = !$entry instanceof CartItem;
        if ($isNew) {
            $entry = (new CartItem())->setCustomer($customer)->setSealedInventoryItem($item);
            $this->entityManager->persist($entry);
        }

        $entry->setQuantity(min($requested, $item->getQuantity()));
        $this->entityManager->flush();

        return $this->json($this->serializeCartItem($entry), $isNew ? 201 : 200);
    }

    #[Route('/cart/sealed/{itemId}', name: 'api_store_customer_cart_sealed_remove', methods: ['DELETE'], requirements: ['itemId' => '\\d+'])]
    public function removeSealedCartItem(string $slug, int $itemId): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $customer = $this->findCustomer($store);
        $item = $customer instanceof StoreCustomer ? $this->sealedInventoryItems->findOneForStore($store, $itemId) : null;
        if ($customer instanceof StoreCustomer && $item instanceof SealedInventoryItem) {
            $entry = $this->cartRepository->findOneForCustomerAndSealedItem($customer, $item);
            if ($entry instanceof CartItem) {
                $this->entityManager->remove($entry);
                $this->entityManager->flush();
            }
        }

        return $this->json(null, 204);
    }

    #[Route('/cart/{itemId}', name: 'api_store_customer_cart_remove', methods: ['DELETE'])]
    public function removeCartItem(string $slug, int $itemId): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        // No customer row means nothing to remove — no-op without persisting.
        $customer = $this->findCustomer($store);
        $item = $customer instanceof StoreCustomer ? $this->findStoreItem($customer, $itemId) : null;
        if ($customer instanceof StoreCustomer && $item instanceof InventoryItem) {
            $entry = $this->cartRepository->findOneForCustomerAndItem($customer, $item);
            if ($entry instanceof CartItem) {
                $this->entityManager->remove($entry);
                $this->entityManager->flush();
            }
        }

        return $this->json(null, 204);
    }

    #[Route('/cart', name: 'api_store_customer_cart_clear', methods: ['DELETE'])]
    public function clearCart(string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $customer = $this->findCustomer($store);
        if ($customer instanceof StoreCustomer) {
            foreach ($this->cartRepository->findForCustomer($customer) as $entry) {
                $this->entityManager->remove($entry);
            }
            $this->entityManager->flush();
        }

        return $this->json(null, 204);
    }

    #[Route('/orders', name: 'api_store_customer_orders', methods: ['GET'])]
    public function orders(Request $request, string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User || null === $user->getEmail()) {
            throw $this->createAccessDeniedException();
        }

        $pagination = CustomerOrderPagination::fromRequest($request);
        $email = $user->getEmail();
        $orders = $this->orderRepository->findPageByStoreAndCustomerEmail(
            $store,
            $email,
            $pagination['offset'],
            $pagination['itemsPerPage'],
        );
        $total = $this->orderRepository->countByStoreAndCustomerEmail($store, $email);

        return CustomerOrderPagination::toJson(
            $orders,
            $total,
            $pagination['page'],
            $pagination['itemsPerPage'],
            $this->customerOrderSerializer,
        );
    }

    #[Route('/notifications', name: 'api_store_customer_notifications', methods: ['GET'])]
    public function notifications(string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        return $this->json(array_map(
            $this->serializeNotification(...),
            $this->notificationRepository->findForUserAndStore($user, $store),
        ));
    }

    #[Route('/notifications/read-all', name: 'api_store_customer_notifications_read_all', methods: ['PATCH'])]
    public function markAllNotificationsRead(string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $read = $this->notificationRepository->markAllReadForUser($user, $store);

        return $this->json(['read' => $read]);
    }

    #[Route('/notifications/{id}/read', name: 'api_store_customer_notification_read', methods: ['PATCH'])]
    public function markNotificationRead(string $slug, int $id): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $notification = $this->notificationRepository->find($id);
        if (!$notification instanceof CustomerNotification || $notification->getUser()?->getId() !== $user->getId() || $notification->getStore()?->getId() !== $store->getId()) {
            return $this->json(['detail' => 'Notification not found.'], 404);
        }

        $notification->markRead();
        $this->entityManager->flush();

        return $this->json($this->serializeNotification($notification));
    }

    #[Route('/test-order', name: 'api_store_customer_test_order', methods: ['POST'])]
    public function createTestOrder(Request $request, string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        $channel = is_array($payload) ? ($payload['channel'] ?? Order::CHANNEL_ONLINE) : Order::CHANNEL_ONLINE;
        if (!in_array($channel, Order::CHANNELS, true)) {
            return $this->json(['detail' => sprintf('Unknown order channel. Valid: %s.', implode(', ', Order::CHANNELS))], 422);
        }

        if (Order::CHANNEL_KIOSK === $channel) {
            // Kiosk checkout works in every environment, but only from a
            // terminal signed in as someone who manages THIS store (the
            // STORE_MANAGE voter covers owners and platform admins) —
            // otherwise any customer could ring up unpaid orders remotely.
            if (!$this->isGranted('STORE_MANAGE', $store)) {
                return $this->json(['detail' => 'Kiosk checkout is only available on the store\'s kiosk terminal.'], 403);
            }
        } elseif (!in_array($this->kernel->getEnvironment(), ['dev', 'test'], true)) {
            return $this->json(['detail' => 'Test orders are only available locally.'], 404);
        }

        $customer = $this->findCustomer($store);
        if (!$customer instanceof StoreCustomer) {
            return $this->json(['detail' => 'Your cart is empty.'], 422);
        }

        $cartItems = $this->cartRepository->findForCustomer($customer);
        if ([] === $cartItems) {
            return $this->json(['detail' => 'Your cart is empty.'], 422);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $fulfillment = is_array($payload) ? ($payload['fulfillment'] ?? Order::FULFILLMENT_PICKUP) : Order::FULFILLMENT_PICKUP;
        if (!in_array($fulfillment, Order::FULFILLMENTS, true)) {
            return $this->json(['detail' => sprintf('Unknown fulfillment method. Valid: %s.', implode(', ', Order::FULFILLMENTS))], 422);
        }

        // Kiosk checkout: the terminal is signed in as a staff/admin account,
        // so the order must NOT be attributed to that account. The walk-up
        // customer types their name instead, and no email is recorded.
        $customerName = $user->getDisplayName();
        $customerEmail = $user->getEmail();
        if (Order::CHANNEL_KIOSK === $channel) {
            $enteredName = is_array($payload) ? trim((string) ($payload['customerName'] ?? '')) : '';
            if ('' === $enteredName) {
                return $this->json(['detail' => 'Please enter the customer name for this kiosk order.'], 422);
            }
            $customerName = mb_substr($enteredName, 0, 255);
            $customerEmail = null;
        }

        try {
            $order = $this->orderBuilder->build(
                $store,
                $user,
                $cartItems,
                $channel,
                $fulfillment,
                $customerName,
                $customerEmail,
                is_array($payload) && (bool) ($payload['useStoreCredit'] ?? false),
            );
        } catch (OutOfStockException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $this->entityManager->flush();

        return $this->json($this->customerOrderSerializer->serialize($order), 201);
    }

    /**
     * Reserve stock for pickup and pay at the counter when online card checkout
     * is unavailable. Only allowed while Square checkout is disabled.
     */
    #[Route('/checkout/pay-in-store', name: 'api_store_customer_checkout_pay_in_store', methods: ['POST'])]
    public function payInStore(Request $request, string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        if ($this->checkoutGateway->isReady($store)) {
            return $this->json(['detail' => 'Online card checkout is available. Use Pay with card instead.'], 422);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];

        $fulfillment = (string) ($payload['fulfillment'] ?? Order::FULFILLMENT_PICKUP);
        if (Order::FULFILLMENT_PICKUP !== $fulfillment) {
            return $this->json(['detail' => 'Pay in store is only available for pickup orders. Choose in-store pickup above.'], 422);
        }

        $customer = $this->findCustomer($store);
        if (!$customer instanceof StoreCustomer) {
            return $this->json(['detail' => 'Your cart is empty.'], 422);
        }

        $cartItems = $this->cartRepository->findForCustomer($customer);
        if ([] === $cartItems) {
            return $this->json(['detail' => 'Your cart is empty.'], 422);
        }

        $customerName = mb_substr(trim((string) ($payload['customerName'] ?? '')), 0, 255);
        if ('' === $customerName) {
            $customerName = $user->getDisplayName();
        }
        $customerEmail = $user->getEmail();
        $overrideEmail = trim((string) ($payload['customerEmail'] ?? ''));
        if ('' !== $overrideEmail && filter_var($overrideEmail, FILTER_VALIDATE_EMAIL)) {
            $customerEmail = mb_substr($overrideEmail, 0, 255);
        }

        try {
            $order = $this->orderBuilder->build(
                $store,
                $user,
                $cartItems,
                Order::CHANNEL_ONLINE,
                $fulfillment,
                $customerName,
                $customerEmail,
                (bool) ($payload['useStoreCredit'] ?? false),
            );
        } catch (OutOfStockException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $this->entityManager->flush();

        return $this->json($this->customerOrderSerializer->serialize($order), 201);
    }

    /**
     * Real card checkout: the shopper pays the STORE through the store's own
     * connected Square account. The platform never touches the funds.
     *
     * Ordering matters. The order is reserved and flushed first so stock and
     * store credit are committed atomically, then the card is charged, then the
     * order is settled. A decline rolls the reservation back. The alternative —
     * charging first — risks taking money with no record of what it bought.
     */
    #[Route('/checkout', name: 'api_store_customer_checkout', methods: ['POST'])]
    public function checkout(Request $request, string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];

        $fulfillment = (string) ($payload['fulfillment'] ?? Order::FULFILLMENT_PICKUP);
        if (!in_array($fulfillment, Order::FULFILLMENTS, true)) {
            return $this->json(['detail' => sprintf('Unknown fulfillment method. Valid: %s.', implode(', ', Order::FULFILLMENTS))], 422);
        }

        if (!$this->checkoutGateway->isReady($store)) {
            return $this->json(['detail' => 'This store is not accepting online payments yet.'], 422);
        }

        $customer = $this->findCustomer($store);
        if (!$customer instanceof StoreCustomer) {
            return $this->json(['detail' => 'Your cart is empty.'], 422);
        }

        $cartItems = $this->cartRepository->findForCustomer($customer);
        if ([] === $cartItems) {
            return $this->json(['detail' => 'Your cart is empty.'], 422);
        }

        $customerName = mb_substr(trim((string) ($payload['customerName'] ?? '')), 0, 255);
        if ('' === $customerName) {
            $customerName = $user->getDisplayName();
        }
        $customerEmail = $user->getEmail();
        $overrideEmail = trim((string) ($payload['customerEmail'] ?? ''));
        if ('' !== $overrideEmail && filter_var($overrideEmail, FILTER_VALIDATE_EMAIL)) {
            $customerEmail = mb_substr($overrideEmail, 0, 255);
        }

        try {
            $order = $this->orderBuilder->build(
                $store,
                $user,
                $cartItems,
                Order::CHANNEL_ONLINE,
                $fulfillment,
                $customerName,
                $customerEmail,
                (bool) ($payload['useStoreCredit'] ?? false),
            );
        } catch (OutOfStockException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $amountDue = $order->getTotalCents() - $order->getCreditAppliedCents();

        // Store credit can cover the whole basket, in which case there is
        // nothing to charge and no card is required. Status stays pending so
        // staff still accept → fulfill (payment is recorded via paidCents).
        if ($amountDue <= 0) {
            $order->setPaidCents(0);
            $this->entityManager->flush();

            return $this->json($this->customerOrderSerializer->serialize($order), 201);
        }

        $useSavedCard = false;
        $sourceId = trim((string) ($payload['token'] ?? ''));
        $verificationToken = $this->nullableString($payload['verificationToken'] ?? null, 1024);

        $this->entityManager->flush();

        try {
            $payment = $this->captureCheckoutPayment(
                $store,
                $order,
                $amountDue,
                $sourceId,
                $verificationToken,
                $user->getEmail(),
                $customer->getPaymentCustomerId(),
            );
        } catch (\RuntimeException $e) {
            $this->stockReleaser->release($order);
            $order->setStatus(OrderStatus::CANCELLED);
            $this->entityManager->flush();

            $message = $e->getMessage();
            $status = 'A payment method is required.' === $message ? 422 : 402;

            return $this->json(['detail' => $message], $status);
        }

        $order
            ->setPaidCents($amountDue)
            ->setPaymentReference($payment['paymentId'])
            ->setSquareOrderId($payment['squareOrderId'] ?? null);

        $this->entityManager->flush();

        return $this->json($this->customerOrderSerializer->serialize($order) + ['receiptUrl' => $payment['receiptUrl']], 201);
    }

    /**
     * @return array{paymentId: string, status: string, receiptUrl: string|null, squareOrderId: string|null}
     */
    private function captureCheckoutPayment(
        Store $store,
        Order $order,
        int $amountDue,
        string $sourceId,
        ?string $verificationToken,
        string $buyerEmail,
        ?string $squareCustomerId,
    ): array {
        if ('' === $sourceId) {
            throw new \RuntimeException('A payment method is required.');
        }

        return $this->checkoutGateway->charge(
            $store,
            $amountDue,
            $sourceId,
            $order->getReference(),
            $verificationToken,
            $order->getReference(),
            $buyerEmail,
            $squareCustomerId,
            $this->squareLineItems($order),
            $order->getCreditAppliedCents(),
            $order->getCustomerName(),
            $order->getFulfillment(),
        );
    }

    /**
     * @return list<array{name: string, quantity: int, priceCents: int}>
     */
    private function squareLineItems(Order $order): array
    {
        $items = [];
        foreach ($order->getLines() as $line) {
            $items[] = [
                'name' => $line->getCardName(),
                'quantity' => $line->getQuantity(),
                'priceCents' => $line->getPriceCents(),
            ];
        }

        return $items;
    }

    /** Public Square configuration the cart needs to render its payment form. */
    #[Route('/checkout/config', name: 'api_store_customer_checkout_config', methods: ['GET'])]
    #[IsGranted('PUBLIC_ACCESS')]
    public function checkoutConfig(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json($this->checkoutGateway->checkoutConfig($store));
    }

    /** Vault Google Pay, Apple Pay, or card on the store's Square account for this shopper. */
    #[Route('/payment-method', name: 'api_store_customer_payment_method', methods: ['POST'])]
    public function savePaymentMethod(Request $request, string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        if (!$this->checkoutGateway->isReady($store)) {
            return $this->json(['detail' => 'This store is not accepting online payments yet.'], 422);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $methodType = (string) ($payload['methodType'] ?? '');
        $sourceId = trim((string) ($payload['token'] ?? ''));
        $verificationToken = $this->nullableString($payload['verificationToken'] ?? null, 1024);

        if (!in_array($methodType, SubscriptionBillingInterface::METHODS, true)) {
            return $this->json(['detail' => 'Choose a valid payment method.'], 422);
        }
        if ('' === $sourceId) {
            return $this->json(['detail' => 'Payment could not be verified. Please try again.'], 422);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $customer = $this->getOrCreateCustomer($store);

        try {
            $vault = $this->checkoutGateway->vaultPaymentMethod(
                $store,
                $sourceId,
                $verificationToken,
                [
                    'email' => $user->getEmail(),
                    'name' => $user->getDisplayName(),
                    'reference' => 'cust-'.$user->getId(),
                ],
                $customer->getPaymentCustomerId(),
                $customer->getPaymentCardId(),
            );
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 402);
        }

        $customer
            ->setPaymentCustomerId($vault['customerId'])
            ->setPaymentCardId($vault['cardId'])
            ->setPaymentMethodType($methodType)
            ->setPaymentBrand($vault['brand'])
            ->setPaymentLast4($vault['last4'])
            ->setPaymentExpires($this->formatCardExpiry($vault['expMonth'], $vault['expYear']));

        $this->entityManager->flush();

        return $this->json($this->serializeCustomer($customer));
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

    private function resolveStore(string $slug): ?Store
    {
        if (!$this->getUser() instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $store = $this->storeRepository->findOneBySlug($slug);

        return $store instanceof Store ? $store : null;
    }

    /** Read-only lookup: returns null when the current user has no customer row for the store. */
    private function findCustomer(Store $store): ?StoreCustomer
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        return $this->customerRepository->findOneForUserAndStore($user, $store);
    }

    /** Create-on-write: returns an existing or freshly-persisted customer row. Callers must flush. */
    private function getOrCreateCustomer(Store $store): StoreCustomer
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $customer = $this->customerRepository->getOrCreateForUserAndStore($user, $store);
        if (null === $customer->getId()) {
            $this->entityManager->persist($customer);
        }

        $this->paymentProfileSync->applyUserPaymentToStoreCustomer($user, $customer);

        return $customer;
    }

    /**
     * Validate optional payment metadata. Returns an error string when invalid, null when acceptable.
     */
    private function validatePaymentMetadata(array $payload): ?string
    {
        $last4 = $this->nullableString($payload['paymentLast4'] ?? null);
        if (null !== $last4 && 1 !== preg_match('/^\d{4}$/', $last4)) {
            return 'paymentLast4 must be exactly 4 digits.';
        }

        $expires = $this->nullableString($payload['paymentExpires'] ?? null);
        if (null !== $expires && 1 !== preg_match('#^(0[1-9]|1[0-2])/(\d{2}|\d{4})$#', $expires)) {
            return 'paymentExpires must be in MM/YYYY or MM/YY format.';
        }

        $brand = $this->nullableString($payload['paymentBrand'] ?? null);
        if (null !== $brand && mb_strlen($brand) > 40) {
            return 'paymentBrand must be at most 40 characters.';
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function emptyCustomer(): array
    {
        return [
            'id' => null,
            'phone' => null,
            'shippingAddress' => null,
            'paymentBrand' => null,
            'paymentLast4' => null,
            'paymentExpires' => null,
            'paymentMethodType' => null,
            'paymentConfigured' => false,
            'savedCardReady' => false,
            'createdAt' => null,
            'updatedAt' => null,
        ];
    }

    private function findStoreItem(StoreCustomer $customer, int $itemId): ?InventoryItem
    {
        $store = $customer->getStore();
        if (!$store instanceof Store) {
            return null;
        }

        return $this->inventoryRepository->findOneByStoreAndId($store, $itemId);
    }

    private function findCard(string $cardId): ?Card
    {
        if ('' === trim($cardId)) {
            return null;
        }

        return $this->cardRepository->find($cardId);
    }

    /** @return array<string, mixed> */
    private function jsonPayload(Request $request): array
    {
        try {
            $payload = $request->toArray();
        } catch (\Throwable) {
            return [];
        }

        return $payload;
    }

    private function nullableString(mixed $value, ?int $maxLength = null): ?string
    {
        $string = trim((string) ($value ?? ''));
        if ('' === $string) {
            return null;
        }

        return null === $maxLength ? $string : mb_substr($string, 0, $maxLength);
    }

    private function generateOrderReference(): string
    {
        return 'ORD-'.strtoupper(bin2hex(random_bytes(4)));
    }

    /** @return array<string, mixed> */
    private function serializeCustomerForRead(StoreCustomer $customer, User $user): array
    {
        $data = $this->serializeCustomer($customer);
        if (true === $data['savedCardReady']) {
            return $data;
        }

        $userLast4 = $user->getPaymentLast4();
        if (null === $userLast4 || '' === $userLast4) {
            return $data;
        }

        return [
            ...$data,
            'paymentBrand' => $user->getPaymentBrand() ?? $data['paymentBrand'],
            'paymentLast4' => $userLast4,
            'paymentExpires' => $user->getPaymentExpires() ?? $data['paymentExpires'],
            'paymentMethodType' => $user->getPaymentMethodType() ?? $data['paymentMethodType'],
            'paymentConfigured' => true,
            'savedCardReady' => false,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeCustomer(StoreCustomer $customer): array
    {
        return [
            'id' => $customer->getId(),
            'phone' => $customer->getPhone(),
            'shippingAddress' => $customer->getShippingAddress(),
            'paymentBrand' => $customer->getPaymentBrand(),
            'paymentLast4' => $customer->getPaymentLast4(),
            'paymentExpires' => $customer->getPaymentExpires(),
            'paymentMethodType' => $customer->getPaymentMethodType(),
            'paymentConfigured' => (null !== $customer->getPaymentCardId() && '' !== $customer->getPaymentCardId())
                || (null !== $customer->getPaymentLast4() && '' !== $customer->getPaymentLast4()),
            'savedCardReady' => null !== $customer->getPaymentCardId() && '' !== $customer->getPaymentCardId(),
            'createdAt' => $customer->getCreatedAt()->format(DATE_ATOM),
            'updatedAt' => $customer->getUpdatedAt()->format(DATE_ATOM),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeFavorite(CustomerFavorite $favorite): array
    {
        return [
            'id' => $favorite->getId(),
            'inventoryItem' => $this->serializeInventoryItem($favorite->getInventoryItem()),
            'createdAt' => $favorite->getCreatedAt()->format(DATE_ATOM),
        ];
    }

    /** @return array<string, mixed> */
    /**
     * The treatment a want-list entry is for. A named one wins; otherwise the
     * old boolean is translated into the printing's own word for that side.
     *
     * @param array<string, mixed> $payload
     */
    private function wantedFinish(array $payload, ?Card $card): string
    {
        $requested = isset($payload['finish']) ? (string) $payload['finish'] : null;
        $foilHint = isset($payload['isFoil']) ? (bool) $payload['isFoil'] : null;

        if (!$card instanceof Card) {
            // A free-text want with no catalog match to consult.
            $canonical = FinishVocabulary::canonical((string) $requested);
            if ('' !== $canonical) {
                return $canonical;
            }

            return ($foilHint ?? false) ? FinishVocabulary::DEFAULT_FOIL : FinishVocabulary::DEFAULT_PLAIN;
        }

        return FinishVocabulary::resolveForCard($card, $requested, $foilHint);
    }

    private function serializeWantListEntry(Store $store, CustomerWantListEntry $entry): array
    {
        $listing = $this->inventoryRepository->findListingForWantEntry(
            $store,
            $entry->getCard(),
            $entry->getCardName(),
            $entry->getSetCode(),
            $entry->getFinish(),
            $entry->isFoil(),
        );

        return [
            'id' => $entry->getId(),
            'card' => $this->serializeCard($entry->getCard()),
            'cardName' => $entry->getCardName(),
            'setCode' => $entry->getSetCode(),
            'finish' => $entry->getFinish(),
            'isFoil' => $entry->isFoil(),
            'quantity' => $entry->getQuantity(),
            'notes' => $entry->getNotes(),
            'inventoryItemId' => $listing?->getId(),
            'createdAt' => $entry->getCreatedAt()->format(DATE_ATOM),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeCartItem(CartItem $entry): array
    {
        $sealedItem = $entry->getSealedInventoryItem();

        return [
            'id' => $entry->getId(),
            'quantity' => $entry->getQuantity(),
            'isSealed' => $entry->isSealed(),
            'inventoryItem' => $this->serializeInventoryItem($entry->getInventoryItem()),
            'sealedItem' => $sealedItem instanceof SealedInventoryItem
                ? $this->catalogSerializer->sealedInventoryItem($sealedItem)
                : null,
            'createdAt' => $entry->getCreatedAt()->format(DATE_ATOM),
            'updatedAt' => $entry->getUpdatedAt()->format(DATE_ATOM),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeNotification(CustomerNotification $notification): array
    {
        return [
            'id' => $notification->getId(),
            'type' => $notification->getType(),
            'title' => $notification->getTitle(),
            'body' => $notification->getBody(),
            'orderId' => $notification->getRelatedOrder()?->getId(),
            'orderReference' => $notification->getRelatedOrder()?->getReference(),
            'createdAt' => $notification->getCreatedAt()->format(DATE_ATOM),
            'readAt' => $notification->getReadAt()?->format(DATE_ATOM),
        ];
    }

    /** @return array<string, mixed>|null */
    private function serializeInventoryItem(?InventoryItem $item): ?array
    {
        if (!$item instanceof InventoryItem) {
            return null;
        }

        return [
            'id' => $item->getId(),
            'quantity' => $item->getQuantity(),
            'priceCents' => $item->getPriceCents(),
            'condition' => $item->getCondition()->value,
            'finish' => $item->getFinish(),
            'isFoil' => $item->isFoil(),
            'notes' => $item->getNotes(),
            'card' => $this->serializeCard($item->getCard()),
        ];
    }

    /** @return array<string, mixed>|null */
    private function serializeCard(?Card $card): ?array
    {
        if (!$card instanceof Card) {
            return null;
        }

        return [
            'id' => (string) $card->getId(),
            'oracleId' => (string) $card->getOracleId(),
            'name' => $card->getName(),
            'setCode' => $card->getSetCode(),
            'setName' => $card->getSetName(),
            'collectorNumber' => $card->getCollectorNumber(),
            'rarity' => $card->getRarity(),
            'typeLine' => $card->getTypeLine(),
            'imageUrl' => $card->getImageUrl(),
            'imageUris' => $card->getImageUris(),
            'prices' => $card->getPrices(),
        ];
    }
}
