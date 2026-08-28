<?php

namespace App\Repository;

use App\Entity\NewsletterSubscriber;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<NewsletterSubscriber>
 */
class NewsletterSubscriberRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, NewsletterSubscriber::class);
    }

    public function findOneByEmail(string $email): ?NewsletterSubscriber
    {
        return $this->findOneBy(['email' => mb_strtolower(trim($email))]);
    }

    public function findOneByToken(string $token): ?NewsletterSubscriber
    {
        $token = trim($token);
        if ('' === $token) {
            return null;
        }

        return $this->findOneBy(['unsubscribeToken' => $token]);
    }

    /** @return list<NewsletterSubscriber> */
    public function findActiveSubscribers(): array
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.unsubscribedAt IS NULL')
            ->orderBy('s.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @return array{items: list<NewsletterSubscriber>, total: int}
     */
    public function searchPaginated(?string $query, int $page, int $limit): array
    {
        $page = max(1, $page);
        $limit = min(100, max(1, $limit));
        $offset = ($page - 1) * $limit;

        $qb = $this->createQueryBuilder('s')
            ->orderBy('s.subscribedAt', 'DESC')
            ->addOrderBy('s.id', 'DESC');

        $trimmed = null !== $query ? trim($query) : '';
        if ('' !== $trimmed) {
            $qb->andWhere('LOWER(s.email) LIKE :q')
                ->setParameter('q', '%'.mb_strtolower($trimmed).'%');
        }

        $total = (int) (clone $qb)
            ->select('COUNT(s.id)')
            ->resetDQLPart('orderBy')
            ->getQuery()
            ->getSingleScalarResult();

        /** @var list<NewsletterSubscriber> $items */
        $items = $qb
            ->setFirstResult($offset)
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'total' => $total];
    }

    /** @return array{total: int, active: int, unsubscribed: int} */
    public function stats(): array
    {
        $total = (int) $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->getQuery()
            ->getSingleScalarResult();

        $active = (int) $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->andWhere('s.unsubscribedAt IS NULL')
            ->getQuery()
            ->getSingleScalarResult();

        return [
            'total' => $total,
            'active' => $active,
            'unsubscribed' => $total - $active,
        ];
    }
}
