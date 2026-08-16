<?php

namespace App\Service\Customer;

use Symfony\Component\HttpFoundation\Request;

/** Shared page/limit parsing for /me activity lists. */
final class ActivityListPagination
{
    public const DEFAULT_ITEMS_PER_PAGE = 20;
    public const MAX_ITEMS_PER_PAGE = 50;

    /** @return array{page: int, itemsPerPage: int, offset: int} */
    public static function fromRequest(Request $request): array
    {
        $page = max(1, (int) $request->query->get('page', 1));
        $itemsPerPage = (int) $request->query->get('itemsPerPage', self::DEFAULT_ITEMS_PER_PAGE);
        $itemsPerPage = min(self::MAX_ITEMS_PER_PAGE, max(1, $itemsPerPage));

        return [
            'page' => $page,
            'itemsPerPage' => $itemsPerPage,
            'offset' => ($page - 1) * $itemsPerPage,
        ];
    }

    /**
     * @param list<mixed> $items
     * @param array{page: int, itemsPerPage: int, offset: int} $pagination
     *
     * @return array{items: list<mixed>, total: int, page: int, itemsPerPage: int}
     */
    public static function payload(array $items, int $total, array $pagination): array
    {
        return [
            'items' => $items,
            'total' => $total,
            'page' => $pagination['page'],
            'itemsPerPage' => $pagination['itemsPerPage'],
        ];
    }
}
