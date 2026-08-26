<?php

namespace App\Controller;

use App\Entity\Order;
use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Repository\OrderRepository;
use App\Repository\StoreRepository;
use App\Service\Order\OrderBalanceDueNotifier;
use App\Service\Order\OrderBalanceDueToken;
use App\Service\Order\OrderPaymentAdjuster;
use App\Service\Payments\StoreCheckoutPresenter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/stores/{slug}/guest/orders/{id}')]
final class StoreGuestOrderPaymentController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly OrderRepository $orders,
        private readonly OrderBalanceDueToken $balanceDueToken,
        private readonly OrderPaymentAdjuster $adjuster,
        private readonly OrderBalanceDueNotifier $notifier,
        private readonly StoreCheckoutPresenter $checkoutPresenter,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('/balance', name: 'api_store_guest_order_balance', methods: ['GET'])]
    public function balance(Request $request, string $slug, int $id): JsonResponse
    {
        $order = $this->verifiedOrder($request, $slug, $id);

        return $this->json($this->serializeBalance($order));
    }

    #[Route('/paypal/order', name: 'api_store_guest_order_paypal_order', methods: ['POST'])]
    public function createPaypalOrder(Request $request, string $slug, int $id): JsonResponse
    {
        $order = $this->verifiedOrder($request, $slug, $id);

        try {
            return $this->json($this->adjuster->createSupplementalPaypalOrder($order));
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }
    }

    #[Route('/paypal/capture', name: 'api_store_guest_order_paypal_capture', methods: ['POST'])]
    public function capturePaypal(Request $request, string $slug, int $id): JsonResponse
    {
        $order = $this->verifiedOrder($request, $slug, $id);
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

        return $this->json($this->serializeBalance($order));
    }

    private function verifiedOrder(Request $request, string $slug, int $id): Order
    {
        $token = trim((string) ($request->query->get('token') ?? ''));
        if ('' === $token && $request->isMethod('POST')) {
            /** @var array<string, mixed> $payload */
            $payload = json_decode($request->getContent(), true) ?? [];
            $token = trim((string) ($payload['token'] ?? ''));
        }
        if ('' === $token) {
            throw $this->createAccessDeniedException('A payment link is required.');
        }

        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            throw $this->createNotFoundException('Store not found.');
        }

        $order = $this->orders->find($id);
        if (!$order instanceof Order || $order->getStore()?->getId() !== $store->getId()) {
            throw $this->createNotFoundException('Order not found.');
        }

        try {
            $this->balanceDueToken->verify($token, $order);
        } catch (\InvalidArgumentException $e) {
            throw $this->createAccessDeniedException($e->getMessage());
        }

        return $order;
    }

    /** @return array<string, mixed> */
    private function serializeBalance(Order $order): array
    {
        $store = $order->getStore();
        if (!$store instanceof Store) {
            throw $this->createNotFoundException('Store not found.');
        }

        $checkout = $this->checkoutPresenter->checkoutConfig($store);

        return [
            'reference' => $order->getReference(),
            'storeName' => $store->getName(),
            'storeSlug' => $store->getSlug(),
            'customerName' => $order->getCustomerName(),
            'balanceDueCents' => $order->getBalanceDueCents(),
            'totalCents' => $order->getTotalCents(),
            'paidCents' => $order->getPaidCents(),
            'paymentProvider' => $order->getPaymentProvider(),
            'paypal' => StorePaymentAccount::PROVIDER_PAYPAL === $order->getPaymentProvider()
                ? ($checkout['paypal'] ?? null)
                : null,
        ];
    }
}
