<?php

namespace App\Controller;

use App\Entity\CartItem;
use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\SealedInventoryItem;
use App\Entity\Store;
use App\Enum\OrderStatus;
use App\Repository\InventoryItemRepository;
use App\Repository\SealedInventoryItemRepository;
use App\Repository\StoreRepository;
use App\Service\Checkout\CartOrderBuilder;
use App\Service\Checkout\OrderStockReleaser;
use App\Service\Checkout\OutOfStockException;
use App\Service\Payments\CheckoutGatewayInterface;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/** Guest checkout — no account required; cart lines are sent in the request body. */
#[Route('/api/stores/{slug}/guest')]
final class StoreGuestCheckoutController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly InventoryItemRepository $inventoryRepository,
        private readonly SealedInventoryItemRepository $sealedRepository,
        private readonly CartOrderBuilder $orderBuilder,
        private readonly CheckoutGatewayInterface $checkoutGateway,
        private readonly OrderStockReleaser $stockReleaser,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('/checkout', name: 'api_store_guest_checkout', methods: ['POST'])]
    public function checkout(Request $request, string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        if (!$this->checkoutGateway->isReady($store)) {
            return $this->json(['detail' => 'This store is not accepting online payments yet.'], 422);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];

        $customerName = mb_substr(trim((string) ($payload['customerName'] ?? '')), 0, 255);
        if ('' === $customerName) {
            return $this->json(['detail' => 'Please enter your name for this order.'], 422);
        }

        $customerEmail = $this->nullableEmail($payload['customerEmail'] ?? null);

        $fulfillment = (string) ($payload['fulfillment'] ?? Order::FULFILLMENT_PICKUP);
        if (!in_array($fulfillment, Order::FULFILLMENTS, true)) {
            return $this->json(['detail' => sprintf('Unknown fulfillment method. Valid: %s.', implode(', ', Order::FULFILLMENTS))], 422);
        }

        $cartItems = $this->virtualCartFromPayload($store, $payload['lines'] ?? null);
        if ([] === $cartItems) {
            return $this->json(['detail' => 'Your cart is empty.'], 422);
        }

        try {
            $order = $this->orderBuilder->build(
                $store,
                null,
                $cartItems,
                Order::CHANNEL_ONLINE,
                $fulfillment,
                $customerName,
                $customerEmail,
                false,
            );
        } catch (OutOfStockException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $amountDue = $order->getTotalCents() - $order->getCreditAppliedCents();
        if ($amountDue <= 0) {
            $order->setStatus(OrderStatus::PAID)->setPaidCents(0);
            $this->entityManager->flush();

            return $this->json($this->serializeOrder($order), 201);
        }

        $sourceId = trim((string) ($payload['token'] ?? ''));
        if ('' === $sourceId) {
            return $this->json(['detail' => 'A payment method is required.'], 422);
        }

        $this->entityManager->flush();

        try {
            $payment = $this->checkoutGateway->charge(
                $store,
                $amountDue,
                $sourceId,
                $order->getReference(),
                trim((string) ($payload['verificationToken'] ?? '')) ?: null,
                $order->getReference(),
                $customerEmail,
            );
        } catch (\RuntimeException $e) {
            $this->stockReleaser->release($order);
            $order->setStatus(OrderStatus::CANCELLED);
            $this->entityManager->flush();

            return $this->json(['detail' => $e->getMessage()], 402);
        }

        $order
            ->setStatus(OrderStatus::PAID)
            ->setPaidCents($amountDue)
            ->setPaymentReference($payment['paymentId']);

        $this->entityManager->flush();

        return $this->json($this->serializeOrder($order) + ['receiptUrl' => $payment['receiptUrl'] ?? null], 201);
    }

    /**
     * @param mixed $lines
     *
     * @return list<CartItem>
     */
    private function virtualCartFromPayload(Store $store, mixed $lines): array
    {
        if (!is_array($lines) || [] === $lines) {
            return [];
        }

        $cartItems = [];
        foreach ($lines as $line) {
            if (!is_array($line)) {
                continue;
            }

            $quantity = (int) ($line['quantity'] ?? 0);
            if ($quantity < 1) {
                continue;
            }

            $inventoryId = isset($line['inventoryItemId']) ? (int) $line['inventoryItemId'] : 0;
            $sealedId = isset($line['sealedItemId']) ? (int) $line['sealedItemId'] : 0;

            if ($inventoryId > 0 && 0 === $sealedId) {
                $item = $this->inventoryRepository->findOneByStoreAndId($store, $inventoryId);
                if (!$item instanceof InventoryItem || $item->getQuantity() < 1) {
                    continue;
                }
                $cartItem = (new CartItem())->setQuantity($quantity)->setInventoryItem($item);
                $cartItems[] = $cartItem;
                continue;
            }

            if ($sealedId > 0 && 0 === $inventoryId) {
                $sealed = $this->sealedRepository->findOneForStore($store, $sealedId);
                if (!$sealed instanceof SealedInventoryItem || $sealed->getQuantity() < 1) {
                    continue;
                }
                $cartItem = (new CartItem())->setQuantity($quantity)->setSealedInventoryItem($sealed);
                $cartItems[] = $cartItem;
            }
        }

        return $cartItems;
    }

    private function nullableEmail(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $trimmed = trim($value);
        if ('' === $trimmed) {
            return null;
        }
        if (!filter_var($trimmed, FILTER_VALIDATE_EMAIL)) {
            return null;
        }

        return mb_substr($trimmed, 0, 255);
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
            'creditAppliedCents' => $order->getCreditAppliedCents(),
            'paidCents' => $order->getPaidCents(),
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
}
