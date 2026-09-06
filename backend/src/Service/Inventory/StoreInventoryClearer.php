<?php

namespace App\Service\Inventory;

use App\Entity\Store;
use Doctrine\DBAL\Connection;

/**
 * Permanently wipes a store's singles and sealed listings.
 *
 * Carts, favorites, and case-card rows follow via ON DELETE CASCADE. Order
 * lines keep the order and SET NULL on the listing pointers.
 *
 * Deletes run as two statements (same pattern as {@see \App\Service\Store\StoreAdminRemover})
 * rather than Connection::transactional(), which opens a nested savepoint that
 * collides with DAMA's test transaction and can hide remaining rows.
 */
final readonly class StoreInventoryClearer
{
    public function __construct(
        private Connection $connection,
    ) {
    }

    /**
     * @return array{deletedSingles: int, deletedSealed: int}
     */
    public function clear(Store $store): array
    {
        $storeId = (int) $store->getId();

        $singles = (int) $this->connection->executeStatement(
            'DELETE FROM inventory_items WHERE store_id = ?',
            [$storeId],
        );
        $sealed = (int) $this->connection->executeStatement(
            'DELETE FROM sealed_inventory_items WHERE store_id = ?',
            [$storeId],
        );

        return [
            'deletedSingles' => $singles,
            'deletedSealed' => $sealed,
        ];
    }
}
