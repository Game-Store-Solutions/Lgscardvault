<?php

namespace App\Repository;

use App\Entity\PaypalWebhookEvent;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<PaypalWebhookEvent>
 */
class PaypalWebhookEventRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, PaypalWebhookEvent::class);
    }

    public function alreadySeen(string $eventId): bool
    {
        return null !== $this->findOneBy(['eventId' => $eventId]);
    }
}
