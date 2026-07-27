<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\CartItem;
use App\Entity\CustomerNotification;
use App\Entity\CustomerFavorite;
use App\Entity\CustomerWantListEntry;
use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
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
        private readonly InventoryItemRepository $inventoryRepository,
        private readonly CardRepository $cardRepository,
        private readonly OrderRepository $orderRepository,
        private readonly \App\Service\CaseCards\SectionSaleAllocator $sectionSaleAllocator,
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
            return $this->json($this->emptyCustomer());
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
            $this->serializeWantListEntry(...),
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
            ->setIsFoil((bool) ($payload['isFoil'] ?? false))
            ->setQuantity(max(1, (int) ($payload['quantity'] ?? 1)))
            ->setNotes($this->nullableString($payload['notes'] ?? null, 255));

        $this->entityManager->persist($entry);
        $this->entityManager->flush();

        return $this->json($this->serializeWantListEntry($entry), 201);
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
    public function orders(string $slug): JsonResponse
    {
        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User || null === $user->getEmail()) {
            throw $this->createAccessDeniedException();
        }

        return $this->json(array_map(
            $this->serializeOrder(...),
            $this->orderRepository->findByStoreAndCustomerEmail($store, $user->getEmail()),
        ));
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
            // terminal signed in as store staff or a platform admin —
            // otherwise any customer could ring up unpaid orders remotely.
            if (!$this->isGranted('ROLE_SUPER_ADMIN') && !$this->isGranted('STORE_MANAGE', $store)) {
                return $this->json(['detail' => 'Kiosk checkout is only available on staff kiosk terminals.'], 403);
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

        $order = (new Order())
            ->setStore($store)
            ->setReference($this->generateOrderReference())
            ->setCustomerName($customerName)
            ->setCustomerEmail($customerEmail)
            ->setChannel($channel)
            ->setFulfillment($fulfillment);

        $total = 0;
        foreach ($cartItems as $cartItem) {
            $inventoryItem = $cartItem->getInventoryItem();
            if (!$inventoryItem instanceof InventoryItem || $inventoryItem->getQuantity() < 1) {
                return $this->json(['detail' => 'One or more cart items are no longer in stock.'], 422);
            }

            $quantity = min($cartItem->getQuantity(), $inventoryItem->getQuantity());
            $line = (new OrderLine())
                ->setCard($inventoryItem->getCard())
                ->setInventoryItem($inventoryItem)
                ->setCardName($inventoryItem->getCard()?->getName() ?? 'Unknown card')
                ->setQuantity($quantity)
                ->setPriceCents($inventoryItem->getPriceCents())
                ->setAcquisitionCostCents($inventoryItem->getAcquisitionCostCents());

            // The sale consumes real stock at placement. The line's quantity is
            // clamped to available stock above, so this can never go negative;
            // cancelling/refunding the order adds it back (StoreOrderStatusProcessor).
            $inventoryItem->setQuantity($inventoryItem->getQuantity() - $quantity);

            // If this listing sits in a display-case section with pool copies
            // left, the sale comes from the case: deplete the section pool and
            // stamp the line with its case/section for pull + print sheets.
            $this->sectionSaleAllocator->allocateLine($line, $inventoryItem, $quantity);

            $order->addLine($line);
            $total += $quantity * $inventoryItem->getPriceCents();
        }

        $order->setTotalCents($total);
        $this->entityManager->persist($order);

        foreach ($cartItems as $cartItem) {
            $this->entityManager->remove($cartItem);
        }

        $this->entityManager->flush();

        return $this->json($this->serializeOrder($order), 201);
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
    private function serializeCustomer(StoreCustomer $customer): array
    {
        return [
            'id' => $customer->getId(),
            'phone' => $customer->getPhone(),
            'shippingAddress' => $customer->getShippingAddress(),
            'paymentBrand' => $customer->getPaymentBrand(),
            'paymentLast4' => $customer->getPaymentLast4(),
            'paymentExpires' => $customer->getPaymentExpires(),
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
    private function serializeWantListEntry(CustomerWantListEntry $entry): array
    {
        return [
            'id' => $entry->getId(),
            'card' => $this->serializeCard($entry->getCard()),
            'cardName' => $entry->getCardName(),
            'setCode' => $entry->getSetCode(),
            'isFoil' => $entry->isFoil(),
            'quantity' => $entry->getQuantity(),
            'notes' => $entry->getNotes(),
            'createdAt' => $entry->getCreatedAt()->format(DATE_ATOM),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeCartItem(CartItem $entry): array
    {
        return [
            'id' => $entry->getId(),
            'quantity' => $entry->getQuantity(),
            'inventoryItem' => $this->serializeInventoryItem($entry->getInventoryItem()),
            'createdAt' => $entry->getCreatedAt()->format(DATE_ATOM),
            'updatedAt' => $entry->getUpdatedAt()->format(DATE_ATOM),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeOrder(Order $order): array
    {
        return [
            'id' => $order->getId(),
            'reference' => $order->getReference(),
            'status' => $order->getStatus()->value,
            'storeName' => $order->getStore()?->getName(),
            'storeSlug' => $order->getStore()?->getSlug(),
            'customerName' => $order->getCustomerName(),
            'customerEmail' => $order->getCustomerEmail(),
            'fulfillment' => $order->getFulfillment(),
            'channel' => $order->getChannel(),
            'totalCents' => $order->getTotalCents(),
            'createdAt' => $order->getCreatedAt()->format(DATE_ATOM),
            'lines' => array_map($this->serializeOrderLine(...), $order->getLines()->toArray()),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeOrderLine(OrderLine $line): array
    {
        return [
            'id' => $line->getId(),
            'cardName' => $line->getCardName(),
            'quantity' => $line->getQuantity(),
            'priceCents' => $line->getPriceCents(),
            'imageUris' => $line->getCard()?->getImageUris(),
            'setCode' => $line->getCard()?->getSetCode(),
            'collectorNumber' => $line->getCard()?->getCollectorNumber(),
            'caseName' => $line->getCaseName(),
            'sectionTitle' => $line->getSectionTitle(),
            'caseQuantity' => $line->getCaseQuantity(),
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
