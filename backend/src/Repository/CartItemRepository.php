<?php

namespace App\Repository;

use App\Entity\CartItem;
use App\Entity\InventoryItem;
use App\Entity\SealedInventoryItem;
use App\Entity\StoreCustomer;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CartItem>
 */
class CartItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CartItem::class);
    }

    public function findOneForCustomerAndItem(StoreCustomer $customer, InventoryItem $item): ?CartItem
    {
        return $this->findOneBy(['customer' => $customer, 'inventoryItem' => $item]);
    }

    public function findOneForCustomerAndSealedItem(StoreCustomer $customer, SealedInventoryItem $item): ?CartItem
    {
        return $this->findOneBy(['customer' => $customer, 'sealedInventoryItem' => $item]);
    }

    /**
     * A cart holds both singles and sealed lines, so every join here is a
     * LEFT join — an inner join on the singles listing would silently drop
     * every sealed line from the cart.
     *
     * @return list<CartItem>
     */
    public function findForCustomer(StoreCustomer $customer): array
    {
        return $this->createQueryBuilder('cartItem')
            ->leftJoin('cartItem.inventoryItem', 'item')->addSelect('item')
            ->leftJoin('item.card', 'card')->addSelect('card')
            ->leftJoin('cartItem.sealedInventoryItem', 'sealedItem')->addSelect('sealedItem')
            ->leftJoin('sealedItem.sealedProduct', 'sealedProduct')->addSelect('sealedProduct')
            ->andWhere('cartItem.customer = :customer')
            ->setParameter('customer', $customer)
            ->orderBy('cartItem.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
