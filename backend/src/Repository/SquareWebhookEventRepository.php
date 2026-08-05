<?php

namespace App\Repository;

use App\Entity\SquareWebhookEvent;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SquareWebhookEvent>
 */
class SquareWebhookEventRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SquareWebhookEvent::class);
    }

    public function alreadySeen(string $eventId): bool
    {
        return null !== $this->findOneBy(['eventId' => $eventId]);
    }
}
