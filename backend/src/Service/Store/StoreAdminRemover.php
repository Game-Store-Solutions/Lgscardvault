<?php

namespace App\Service\Store;

use App\Entity\Store;
use App\Entity\User;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Hard-deletes a store and the rows that lack ON DELETE CASCADE from stores.
 * Prefer disable ({@see Store::setIsActive}) when you only need to take a
 * storefront offline.
 */
final readonly class StoreAdminRemover
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private Connection $connection,
    ) {
    }

    public function remove(Store $store): void
    {
        $storeId = (int) $store->getId();
        $owner = $store->getOwner();

        // Order of deletes matters: leaf rows first, then parents that still
        // reference stores without CASCADE (orders, inventory, csv jobs).
        $this->connection->executeStatement(
            'DELETE FROM order_lines WHERE order_id IN (SELECT id FROM orders WHERE store_id = ?)',
            [$storeId],
        );
        $this->connection->executeStatement('DELETE FROM orders WHERE store_id = ?', [$storeId]);

        $this->connection->executeStatement(
            'DELETE FROM csv_import_rows WHERE job_id IN (SELECT id FROM csv_import_jobs WHERE store_id = ?)',
            [$storeId],
        );
        $this->connection->executeStatement('DELETE FROM csv_import_jobs WHERE store_id = ?', [$storeId]);

        // Favorites reference inventory; wipe inventory after carts/favorites cascade via customer paths.
        $this->connection->executeStatement(
            'DELETE FROM customer_favorites WHERE inventory_item_id IN (SELECT id FROM inventory_items WHERE store_id = ?)',
            [$storeId],
        );
        $this->connection->executeStatement(
            'DELETE FROM cart_items WHERE inventory_item_id IN (SELECT id FROM inventory_items WHERE store_id = ?)',
            [$storeId],
        );
        $this->connection->executeStatement('DELETE FROM inventory_items WHERE store_id = ?', [$storeId]);

        $this->entityManager->remove($store);
        $this->entityManager->flush();

        if ($owner instanceof User) {
            $this->maybeRevokeStoreOwnerRole($owner);
        }
    }

    private function maybeRevokeStoreOwnerRole(User $owner): void
    {
        $remaining = $this->entityManager->getRepository(Store::class)->count(['owner' => $owner]);
        if ($remaining > 0) {
            return;
        }

        $roles = array_values(array_filter(
            $owner->getRoles(),
            static fn (string $role): bool => 'ROLE_STORE_OWNER' !== $role && 'ROLE_USER' !== $role,
        ));
        $owner->setRoles($roles);
        $this->entityManager->flush();
    }
}
