<?php

namespace App\Controller;

use App\Entity\Order;
use App\Entity\Store;
use App\Repository\OrderRepository;
use App\Repository\StoreRepository;
use App\Service\Checkout\PickupOrderTaxSync;
use App\Service\Order\OrderBalanceDueNotifier;
use App\Service\Order\OrderPaymentAdjuster;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/stores/{slug}/orders/{id}')]
#[IsGranted('ROLE_USER')]
final class StoreOrderPaymentController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly OrderRepository $orders,
        private readonly OrderPaymentAdjuster $adjuster,
        private readonly OrderBalanceDueNotifier $notifier,
        private readonly PickupOrderTaxSync $pickupOrderTaxSync,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /**
     * Refresh Square location tax onto kiosk / pay-in-store orders so pick
     * sheets and counters show the amount due with tax.
     */
    #[Route('/sync-tax', name: 'api_store_order_sync_tax', methods: ['POST'])]
    public function syncTax(string $slug, int $id): JsonResponse
    {
        [$store, $order] = $this->managedOrder($slug, $id);
        $this->pickupOrderTaxSync->sync($store, $order);
        $this->entityManager->flush();

        return $this->json($order, 200, [], ['groups' => ['order:read']]);
    }

    #[Route('/payment-adjustment', name: 'api_store_order_payment_adjustment', methods: ['POST'])]
    public function refundCredit(string $slug, int $id): JsonResponse
    {
        [, $order] = $this->managedOrder($slug, $id);

        try {
            $this->adjuster->refundCredit($order);
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $this->notifier->sync($order);
        $this->entityManager->flush();

        return $this->json($order, 200, [], ['groups' => ['order:read']]);
    }

    /** @return array{0: Store, 1: Order} */
    private function managedOrder(string $slug, int $id): array
    {
        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            throw $this->createNotFoundException('Store not found.');
        }
        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        $order = $this->orders->find($id);
        if (!$order instanceof Order || $order->getStore()?->getId() !== $store->getId()) {
            throw $this->createNotFoundException('Order not found.');
        }

        return [$store, $order];
    }
}
