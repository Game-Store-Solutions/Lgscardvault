<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\Pagination\TraversablePaginator;
use ApiPlatform\State\ProviderInterface;
use App\Entity\Order;
use App\Entity\Store;
use App\Enum\AdminOrderQueue;
use App\MultiTenancy\TenantContext;
use App\Repository\OrderRepository;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Paginated store orders collection (newest first). Previously hydrated and
 * serialized EVERY order (plus lazy per-line card loads) in one response —
 * unbounded growth with store age. Clients page with `?page=` and
 * `?itemsPerPage=` (capped); the admin frontend walks pages.
 *
 * @implements ProviderInterface<Order>
 */
final readonly class StoreOrderCollectionProvider implements ProviderInterface
{
    private const DEFAULT_ITEMS_PER_PAGE = 100;
    private const MAX_ITEMS_PER_PAGE = 200;

    public function __construct(
        private OrderRepository $orderRepository,
        private TenantContext $tenantContext,
        private RequestStack $requestStack,
    ) {
    }

    public function provide(Operation $operation, array $uriVariables = [], array $context = []): object|array|null
    {
        $store = $this->tenantContext->getStore();
        if (!$store instanceof Store) {
            throw new NotFoundHttpException('Store not found.');
        }

        $filters = is_array($context['filters'] ?? null) ? $context['filters'] : [];
        $request = $this->requestStack->getCurrentRequest();
        $queueRaw = $filters['queue'] ?? $request?->query->get('queue');
        $queue = AdminOrderQueue::tryFromFilter(is_string($queueRaw) ? $queueRaw : null);
        $statuses = $queue?->statuses();

        $page = max(1, (int) ($filters['page'] ?? $request?->query->get('page', 1)));
        $itemsPerPage = (int) ($filters['itemsPerPage'] ?? $request?->query->get('itemsPerPage', self::DEFAULT_ITEMS_PER_PAGE));

        $itemsPerPage = min(self::MAX_ITEMS_PER_PAGE, max(1, $itemsPerPage));

        $orders = $this->orderRepository->findPageByStore($store, ($page - 1) * $itemsPerPage, $itemsPerPage, $statuses);
        $total = $this->orderRepository->countByStore($store, $statuses);

        return new TraversablePaginator(new \ArrayIterator($orders), $page, $itemsPerPage, $total);
    }
}
