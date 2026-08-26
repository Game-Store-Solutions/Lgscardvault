<?php

namespace App\Controller;

use App\Entity\Order;
use App\Entity\Store;
use App\Entity\User;
use App\Repository\OrderRepository;
use App\Repository\StoreRepository;
use App\Service\Order\CustomerOrderSerializer;
use App\Service\Order\OrderBalanceDueNotifier;
use App\Service\Order\OrderPaymentAdjuster;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/stores/{slug}/customer/orders/{id}')]
#[IsGranted('ROLE_USER')]
final class StoreCustomerOrderPaymentController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly OrderRepository $orders,
        private readonly OrderPaymentAdjuster $adjuster,
        private readonly OrderBalanceDueNotifier $notifier,
        private readonly CustomerOrderSerializer $serializer,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('/paypal/order', name: 'api_store_customer_order_paypal_order', methods: ['POST'])]
    public function createPaypalOrder(string $slug, int $id): JsonResponse
    {
        $order = $this->ownedOrder($slug, $id);

        try {
            return $this->json($this->adjuster->createSupplementalPaypalOrder($order));
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }
    }

    #[Route('/paypal/capture', name: 'api_store_customer_order_paypal_capture', methods: ['POST'])]
    public function capturePaypal(Request $request, string $slug, int $id): JsonResponse
    {
        $order = $this->ownedOrder($slug, $id);
        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $paypalOrderId = trim((string) ($payload['paypalOrderId'] ?? $payload['token'] ?? ''));

        try {
            $this->adjuster->captureSupplementalPaypal($order, $paypalOrderId);
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $this->notifier->sync($order);
        $this->entityManager->flush();

        return $this->json($this->serializer->serialize($order));
    }

    private function ownedOrder(string $slug, int $id): Order
    {
        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            throw $this->createNotFoundException('Store not found.');
        }

        $user = $this->getUser();
        if (!$user instanceof User || null === $user->getEmail()) {
            throw $this->createAccessDeniedException();
        }

        $order = $this->orders->find($id);
        if (
            !$order instanceof Order
            || $order->getStore()?->getId() !== $store->getId()
            || strtolower((string) $order->getCustomerEmail()) !== strtolower($user->getEmail())
        ) {
            throw $this->createNotFoundException('Order not found.');
        }

        return $order;
    }
}
