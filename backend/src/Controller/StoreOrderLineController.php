<?php

namespace App\Controller;

use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Repository\OrderRepository;
use App\Repository\StoreRepository;
use App\Service\Order\OrderBalanceDueNotifier;
use App\Service\Order\OrderCreditReconciler;
use App\Service\Order\OrderLineEditor;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/stores/{slug}/orders/{id}')]
#[IsGranted('ROLE_USER')]
final class StoreOrderLineController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly OrderRepository $orders,
        private readonly OrderLineEditor $editor,
        private readonly OrderCreditReconciler $creditReconciler,
        private readonly OrderBalanceDueNotifier $notifier,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('/lines', name: 'api_store_order_line_add', methods: ['POST'])]
    public function add(Request $request, string $slug, int $id): JsonResponse
    {
        [$store, $order] = $this->managedOrder($slug, $id);
        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $quantity = max(1, (int) ($payload['quantity'] ?? 1));

        try {
            if (isset($payload['inventoryItemId'])) {
                $this->editor->addFromListing($order, $store, (int) $payload['inventoryItemId'], $quantity);
            } elseif (isset($payload['sealedInventoryItemId'])) {
                $this->editor->addFromSealedListing($order, $store, (int) $payload['sealedInventoryItemId'], $quantity);
            } else {
                return $this->json(['detail' => 'Choose an in-stock listing to add.'], 422);
            }
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        return $this->finishLineEdit($order);
    }

    #[Route('/lines/{lineId}', name: 'api_store_order_line_update', methods: ['PATCH'])]
    public function update(Request $request, string $slug, int $id, int $lineId): JsonResponse
    {
        [$store, $order] = $this->managedOrder($slug, $id);
        unset($store);
        $line = $this->lineOnOrder($order, $lineId);
        if (!$line instanceof OrderLine) {
            return $this->json(['detail' => 'Line not found on this order.'], 404);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        if (!array_key_exists('quantity', $payload)) {
            return $this->json(['detail' => 'Quantity is required.'], 422);
        }

        try {
            $this->editor->changeQuantity($order, $line, (int) $payload['quantity']);
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        return $this->finishLineEdit($order);
    }

    #[Route('/lines/{lineId}', name: 'api_store_order_line_remove', methods: ['DELETE'])]
    public function remove(string $slug, int $id, int $lineId): JsonResponse
    {
        [$store, $order] = $this->managedOrder($slug, $id);
        unset($store);
        $line = $this->lineOnOrder($order, $lineId);
        if (!$line instanceof OrderLine) {
            return $this->json(['detail' => 'Line not found on this order.'], 404);
        }

        try {
            $this->editor->removeLine($order, $line);
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        return $this->finishLineEdit($order);
    }

    private function finishLineEdit(Order $order): JsonResponse
    {
        try {
            $this->creditReconciler->reconcile($order);
        } catch (\RuntimeException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $this->entityManager->flush();
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

    private function lineOnOrder(Order $order, int $lineId): ?OrderLine
    {
        foreach ($order->getLines() as $line) {
            if ($line->getId() === $lineId) {
                return $line;
            }
        }

        return null;
    }
}
