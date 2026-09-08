<?php

namespace App\Controller;

use App\Entity\CartItem;
use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\SealedInventoryItem;
use App\Entity\Store;
use App\Repository\InventoryItemRepository;
use App\Repository\SealedInventoryItemRepository;
use App\Repository\StoreRepository;
use App\Service\Checkout\CartOrderBuilder;
use App\Service\Checkout\OutOfStockException;
use App\Service\Checkout\PickupFulfillment;
use App\Service\Checkout\PickupOrderTaxSync;
use App\Service\Order\CustomerOrderSerializer;
use App\Service\Store\KioskSessionToken;
use App\Service\Store\StoreSettingsUpdater;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/stores/{slug}/kiosk')]
class StoreKioskController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly StoreSettingsUpdater $settingsUpdater,
        private readonly KioskSessionToken $kioskSessionToken,
        private readonly CartOrderBuilder $orderBuilder,
        private readonly PickupOrderTaxSync $pickupOrderTaxSync,
        private readonly CustomerOrderSerializer $customerOrderSerializer,
        private readonly InventoryItemRepository $inventoryRepository,
        private readonly SealedInventoryItemRepository $sealedRepository,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /**
     * Mint a long-lived kiosk session token. Called while staff still have a
     * valid login; the token keeps the terminal shopping after JWT expiry.
     */
    #[Route('/start', name: 'api_store_kiosk_start', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function start(string $slug): JsonResponse
    {
        $store = $this->requireStore($slug);
        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        if (!$store->isKioskExitCodeSet()) {
            return $this->json([
                'detail' => 'Set a kiosk exit code in Admin settings before using kiosk mode.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json(['token' => $this->kioskSessionToken->issue($store)]);
    }

    /**
     * Place a pay-at-counter kiosk order from guest cart lines. Authorized by
     * the kiosk session token — not the owner JWT — so walk-ups keep shopping
     * after the staff session expires.
     */
    #[Route('/order', name: 'api_store_kiosk_order', methods: ['POST'])]
    public function order(string $slug, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $sessionToken = $this->readSessionToken($request, $payload);
        if (!$this->kioskSessionToken->verify($store, $sessionToken)) {
            return $this->json(['detail' => 'Kiosk session expired. Exit and re-enter kiosk mode.'], Response::HTTP_FORBIDDEN);
        }

        $customerName = mb_substr(trim((string) ($payload['customerName'] ?? '')), 0, 255);
        if ('' === $customerName) {
            return $this->json(['detail' => 'Please enter the customer name for this kiosk order.'], 422);
        }

        $fulfillment = PickupFulfillment::resolve($payload['fulfillment'] ?? 'pickup');
        if ($fulfillment instanceof JsonResponse) {
            return $fulfillment;
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
                Order::CHANNEL_KIOSK,
                $fulfillment,
                $customerName,
                null,
                false,
            );
        } catch (OutOfStockException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $this->pickupOrderTaxSync->sync($store, $order);
        $this->entityManager->flush();

        return $this->json($this->customerOrderSerializer->serialize($order), 201);
    }

    /**
     * Confirm the store's kiosk exit code so a locked terminal can leave
     * customer-facing mode. The exit code is the gate — no staff JWT required.
     */
    #[Route('/verify-exit', name: 'api_store_kiosk_verify_exit', methods: ['POST'])]
    public function verifyExit(string $slug, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);

        if (!$store->isKioskExitCodeSet()) {
            // Misconfigured / legacy: only a signed-in manager may leave.
            $this->denyAccessUnlessGranted('STORE_MANAGE', $store);
            $store->bumpKioskSessionEpoch();
            $this->entityManager->flush();

            return $this->json(['ok' => true]);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $code = is_string($payload['code'] ?? null) ? (string) $payload['code'] : '';

        if (!$this->settingsUpdater->verifyKioskExitCode($store, $code)) {
            return $this->json(['detail' => 'Incorrect exit code.'], Response::HTTP_FORBIDDEN);
        }

        $store->bumpKioskSessionEpoch();
        $this->entityManager->flush();

        return $this->json(['ok' => true]);
    }

    private function requireStore(string $slug): Store
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            throw new NotFoundHttpException(sprintf('Store "%s" not found.', $slug));
        }

        return $store;
    }

    /** @param array<string, mixed> $payload */
    private function readSessionToken(Request $request, array $payload): string
    {
        $header = trim((string) $request->headers->get('X-Kiosk-Session', ''));
        if ('' !== $header) {
            return $header;
        }

        return is_string($payload['sessionToken'] ?? null) ? trim((string) $payload['sessionToken']) : '';
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
                $cartItems[] = (new CartItem())->setQuantity($quantity)->setInventoryItem($item);
                continue;
            }

            if ($sealedId > 0 && 0 === $inventoryId) {
                $sealed = $this->sealedRepository->findOneForStore($store, $sealedId);
                if (!$sealed instanceof SealedInventoryItem || $sealed->getQuantity() < 1) {
                    continue;
                }
                $cartItems[] = (new CartItem())->setQuantity($quantity)->setSealedInventoryItem($sealed);
            }
        }

        return $cartItems;
    }
}
