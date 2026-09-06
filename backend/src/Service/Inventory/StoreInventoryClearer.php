<?php

namespace App\Service\Inventory;

use App\Entity\Store;
use Doctrine\DBAL\Connection;

/**
 * Permanently wipes a store's singles and sealed listings in one transaction.
 *
 * Carts, favorites, and case-card rows follow via ON DELETE CASCADE. Order
 * lines keep the order and SET NULL on the listing pointers.
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

        return $this->connection->transactional(function (Connection $conn) use ($storeId): array {
            $singles = (int) $conn->executeStatement(
                'DELETE FROM inventory_items WHERE store_id = ?',
                [$storeId],
            );
            $sealed = (int) $conn->executeStatement(
                'DELETE FROM sealed_inventory_items WHERE store_id = ?',
                [$storeId],
            );

            return [
                'deletedSingles' => $singles,
                'deletedSealed' => $sealed,
            ];
        });
    }
}
