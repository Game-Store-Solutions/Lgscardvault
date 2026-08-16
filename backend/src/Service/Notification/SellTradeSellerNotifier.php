<?php

namespace App\Service\Notification;

use App\Entity\CustomerNotification;
use App\Entity\SellSubmission;
use App\Entity\Store;
use App\Entity\User;
use App\Repository\CustomerNotificationRepository;
use App\Service\Mail\TransactionalMailer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

/**
 * In-app + email updates for the shopper who submitted a sell/trade.
 * Kiosk walk-ups are paid at the counter, so they are skipped.
 */
final class SellTradeSellerNotifier
{
    public function __construct(
        private readonly CustomerNotificationRepository $notifications,
        private readonly TransactionalMailer $mail,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    public function notify(Store $store, SellSubmission $submission): void
    {
        if (SellSubmission::CHANNEL_KIOSK === $submission->getChannel()) {
            return;
        }

        $seller = $submission->getUser();
        if (!$seller instanceof User) {
            return;
        }

        $copy = $this->copyFor($store, $submission);
        if (null === $copy) {
            return;
        }

        if (!$this->notifications->findOneByTitle($seller, $store, $copy['type'], $copy['title']) instanceof CustomerNotification) {
            $this->entityManager->persist(
                (new CustomerNotification())
                    ->setUser($seller)
                    ->setStore($store)
                    ->setType($copy['type'])
                    ->setTitle($copy['title'])
                    ->setBody($copy['body']),
            );
            $this->entityManager->flush();
        }

        if (!in_array($submission->getStatus(), [SellSubmission::STATUS_ACCEPTED, SellSubmission::STATUS_DECLINED], true)) {
            return;
        }

        try {
            if (SellSubmission::STATUS_ACCEPTED === $submission->getStatus()) {
                $this->mail->sendSellTradeAccepted($submission, $seller, $store);
            } else {
                $this->mail->sendSellTradeDeclined($submission, $seller, $store);
            }
        } catch (TransportExceptionInterface) {
            // In-app notification still saved if Mailpit / SMTP is down.
        }
    }

    /**
     * @return array{type: string, title: string, body: string}|null
     */
    private function copyFor(Store $store, SellSubmission $submission): ?array
    {
        $id = $submission->getId() ?? 0;
        $storeName = $store->getName() ?? 'the store';
        $amount = number_format($submission->getTotalOfferCents() / 100, 2);
        $credit = SellSubmission::PAYOUT_CREDIT === $submission->getPayoutMethod();

        return match ($submission->getStatus()) {
            SellSubmission::STATUS_ACCEPTED => [
                'type' => CustomerNotification::TYPE_SELL_TRADE_ACCEPTED,
                'title' => sprintf('Sell/trade #%d accepted', $id),
                'body' => $credit
                    ? sprintf('%s accepted your sell/trade for $%s in store credit. Bring the cards to finish the payout.', $storeName, $amount)
                    : sprintf('%s accepted your sell/trade for $%s cash. Bring the cards to finish the payout.', $storeName, $amount),
            ],
            SellSubmission::STATUS_DECLINED => [
                'type' => CustomerNotification::TYPE_SELL_TRADE_DECLINED,
                'title' => sprintf('Sell/trade #%d declined', $id),
                'body' => sprintf('%s declined your sell/trade.', $storeName),
            ],
            SellSubmission::STATUS_COMPLETED => [
                'type' => CustomerNotification::TYPE_SELL_TRADE_COMPLETED,
                'title' => sprintf('Sell/trade #%d completed', $id),
                'body' => $credit
                    ? sprintf('Your sell/trade at %s went through. $%s was added to your store credit.', $storeName, $amount)
                    : sprintf('Your sell/trade at %s went through. The store will pay you $%s in cash.', $storeName, $amount),
            ],
            default => null,
        };
    }
}
