<?php

namespace App\Service\Notification;

use App\Entity\CustomerNotification;
use App\Entity\Store;
use App\Entity\User;
use App\Repository\CustomerNotificationRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * One reusable “draft saved” alert per store for the signed-in shopper.
 * Upserted when they leave sell/trade with cards still on the list; cleared
 * when the draft is emptied or submitted.
 */
final class SellTradeDraftNotifier
{
    public function __construct(
        private readonly CustomerNotificationRepository $notifications,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    public function notifySaved(User $user, Store $store, int $cardCount): void
    {
        if ($cardCount < 1) {
            $this->clear($user, $store);

            return;
        }

        $title = 'Sell/trade draft saved';
        $body = sprintf(
            'Your unfinished list at %s (%d card%s) is saved. Open Sell / Trade to continue or submit.',
            $store->getName(),
            $cardCount,
            1 === $cardCount ? '' : 's',
        );

        $existing = $this->notifications->findLatestOfType(
            $user,
            $store,
            CustomerNotification::TYPE_SELL_TRADE_DRAFT_SAVED,
        );

        if ($existing instanceof CustomerNotification) {
            $existing
                ->setTitle($title)
                ->setBody($body)
                ->markUnread()
                ->touchCreatedAt();
        } else {
            $this->entityManager->persist(
                (new CustomerNotification())
                    ->setUser($user)
                    ->setStore($store)
                    ->setType(CustomerNotification::TYPE_SELL_TRADE_DRAFT_SAVED)
                    ->setTitle($title)
                    ->setBody($body),
            );
        }

        $this->entityManager->flush();
    }

    public function clear(User $user, Store $store): void
    {
        $existing = $this->notifications->findLatestOfType(
            $user,
            $store,
            CustomerNotification::TYPE_SELL_TRADE_DRAFT_SAVED,
        );
        if (!$existing instanceof CustomerNotification) {
            return;
        }

        $this->entityManager->remove($existing);
        $this->entityManager->flush();
    }
}
