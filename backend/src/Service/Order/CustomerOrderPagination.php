<?php

namespace App\Service\Order;

use App\Entity\Order;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/** Query params for customer order list endpoints (`/me/orders`, `…/customer/orders`). */
final class CustomerOrderPagination
{
    public const DEFAULT_ITEMS_PER_PAGE = 15;
    public const MAX_ITEMS_PER_PAGE = 50;

    /** @return array{page: int, itemsPerPage: int, offset: int} */
    public static function fromRequest(Request $request): array
    {
        $page = max(1, (int) $request->query->get('page', 1));
        $itemsPerPage = (int) $request->query->get('itemsPerPage', self::DEFAULT_ITEMS_PER_PAGE);
        $itemsPerPage = min(self::MAX_ITEMS_PER_PAGE, max(1, $itemsPerPage));
        $offset = ($page - 1) * $itemsPerPage;

        return [
            'page' => $page,
            'itemsPerPage' => $itemsPerPage,
            'offset' => $offset,
        ];
    }

    /**
     * @param list<Order> $orders
     */
    public static function toJson(
        array $orders,
        int $total,
        int $page,
        int $itemsPerPage,
        CustomerOrderSerializer $serializer,
    ): JsonResponse {
        return new JsonResponse([
            'items' => array_map($serializer->serialize(...), $orders),
            'total' => $total,
            'page' => $page,
            'itemsPerPage' => $itemsPerPage,
        ]);
    }
}
