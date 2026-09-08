<?php

namespace App\Repository;

use App\Entity\CustomerWantListEntry;
use App\Entity\Store;
use App\Entity\StoreCustomer;
use App\Entity\User;
use App\Service\Catalog\FinishVocabulary;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CustomerWantListEntry>
 */
class CustomerWantListEntryRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CustomerWantListEntry::class);
    }

    /** @return list<CustomerWantListEntry> */
    /**
     * Want-list entries matching a card name, across EVERY store's customers
     * — a want can be filled by any store that stocks the card.
     *
     * @return list<CustomerWantListEntry>
     */
    public function findMatchingCardName(string $cardName): array
    {
        return $this->createQueryBuilder('w')
            ->join('w.customer', 'c')->addSelect('c')
            ->join('c.user', 'u')->addSelect('u')
            ->andWhere('LOWER(w.cardName) = LOWER(:name)')
            ->setParameter('name', $cardName)
            ->getQuery()
            ->getResult();
    }

    public function findForCustomer(StoreCustomer $customer): array
    {
        return $this->createQueryBuilder('entry')
            ->leftJoin('entry.card', 'card')
            ->addSelect('card')
            ->andWhere('entry.customer = :customer')
            ->setParameter('customer', $customer)
            ->orderBy('entry.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Every want-list row for this shopper, optionally limited to one store.
     *
     * @return list<CustomerWantListEntry>
     */
    public function findForUser(User $user, ?Store $store = null, ?int $offset = null, ?int $limit = null): array
    {
        $qb = $this->createQueryBuilder('entry')
            ->leftJoin('entry.card', 'card')->addSelect('card')
            ->innerJoin('entry.customer', 'customer')->addSelect('customer')
            ->innerJoin('customer.store', 'store')->addSelect('store')
            ->andWhere('customer.user = :user')
            ->setParameter('user', $user)
            ->orderBy('entry.createdAt', 'DESC')
            ->addOrderBy('entry.id', 'DESC');

        if ($store instanceof Store) {
            $qb->andWhere('customer.store = :store')->setParameter('store', $store);
        }
        if (null !== $offset) {
            $qb->setFirstResult($offset);
        }
        if (null !== $limit) {
            $qb->setMaxResults($limit);
        }

        return $qb->getQuery()->getResult();
    }

    public function countForUser(User $user, ?Store $store = null): int
    {
        $qb = $this->createQueryBuilder('entry')
            ->select('COUNT(entry.id)')
            ->innerJoin('entry.customer', 'customer')
            ->andWhere('customer.user = :user')
            ->setParameter('user', $user);

        if ($store instanceof Store) {
            $qb->andWhere('customer.store = :store')->setParameter('store', $store);
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    /**
     * Most-wanted cards for a store, ranked by total quantity then distinct shoppers.
     *
     * @return list<array{
     *     cardName: string,
     *     setCode: string|null,
     *     finish: string,
     *     quantity: int,
     *     wanters: int,
     *     entries: int
     * }>
     */
    public function aggregateMostWantedForStore(Store $store, int $limit = 25): array
    {
        $limit = max(1, min(100, $limit));

        $rows = $this->createQueryBuilder('w')
            ->select(
                'w.cardName AS cardName',
                'MAX(w.setCode) AS setCode',
                'w.finish AS finish',
                'SUM(w.quantity) AS quantity',
                'COUNT(DISTINCT c.id) AS wanters',
                'COUNT(w.id) AS entries',
            )
            ->innerJoin('w.customer', 'c')
            ->andWhere('c.store = :store')
            ->setParameter('store', $store)
            ->groupBy('w.cardName', 'w.finish')
            ->orderBy('quantity', 'DESC')
            ->addOrderBy('wanters', 'DESC')
            ->addOrderBy('w.cardName', 'ASC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getArrayResult();

        return array_map(static function (array $row): array {
            return [
                'cardName' => (string) ($row['cardName'] ?? ''),
                'setCode' => isset($row['setCode']) && '' !== (string) $row['setCode'] ? (string) $row['setCode'] : null,
                'finish' => (string) ($row['finish'] ?? FinishVocabulary::DEFAULT_PLAIN),
                'quantity' => (int) ($row['quantity'] ?? 0),
                'wanters' => (int) ($row['wanters'] ?? 0),
                'entries' => (int) ($row['entries'] ?? 0),
            ];
        }, $rows);
    }
}
