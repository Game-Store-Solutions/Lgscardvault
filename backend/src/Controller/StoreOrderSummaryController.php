<?php

namespace App\Controller;

use App\Repository\OrderRepository;
use App\Repository\StoreRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class StoreOrderSummaryController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly OrderRepository $orderRepository,
    ) {
    }

    /** Admin nav badge + Orders tab counts (store-wide, not current page). */
    #[Route('/api/stores/{slug}/orders-open-count', name: 'api_store_orders_open_count', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function openCount(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            throw new NotFoundHttpException(sprintf('Store "%s" not found.', $slug));
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $this->json($this->orderRepository->countQueueSummaryByStore($store));
    }
}
