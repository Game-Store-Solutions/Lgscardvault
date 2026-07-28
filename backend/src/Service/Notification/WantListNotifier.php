<?php

namespace App\Service\Notification;

use App\Entity\Card;
use App\Entity\CustomerNotification;
use App\Entity\Store;
use App\Repository\CustomerNotificationRepository;
use App\Repository\CustomerWantListEntryRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Cross-store want-list fulfillment alerts: whenever a store lists a card,
 * every customer wanting that card (at ANY store) gets an in-app
 * notification pointing at the store that now stocks it.
 *
 * Deduped per (user, store, exact title), so restocks and CSV re-imports
 * don't spam — a user is told once that a given store has a given card.
 */
final class WantListNotifier
{
    public function __construct(
        private readonly CustomerWantListEntryRepository $wantListEntries,
        private readonly CustomerNotificationRepository $notifications,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /**
     * Call after an inventory write that leaves the listing in stock. Does
     * NOT flush — it joins the caller's transaction so notification writes
     * ride along with the inventory write itself.
     */
    public function notifyAvailability(Store $store, Card $card): void
    {
        $cardName = $card->getName();
        if (null === $cardName || '' === $cardName) {
            return;
        }

        $entries = $this->wantListEntries->findMatchingCardName($cardName);

        // Names are only unique within a game: stocking a One Piece card must
        // not fire "your card is in stock" at someone wanting the same-named
        // Magic card. Entries linked to a card compare games; text-only
        // entries came from Magic surfaces and only match Magic stock.
        $stockedGame = $card->resolvedGameCode();
        $entries = array_filter($entries, static function ($entry) use ($stockedGame): bool {
            $wantedGame = $entry->getCard()?->resolvedGameCode() ?? \App\Entity\Game::CODE_MTG;

            return $wantedGame === $stockedGame;
        });
        if ([] === $entries) {
            return;
        }

        $title = sprintf('%s is in stock', $cardName);
        $body = sprintf('%s — from your want list — is now available at %s.', $cardName, $store->getName() ?? 'a store');

        $notified = [];
        foreach ($entries as $entry) {
            $user = $entry->getCustomer()?->getUser();
            if (null === $user || null === $user->getId()) {
                continue;
            }
            // One notification per user even if they want the card at
            // several stores' want lists.
            if (isset($notified[$user->getId()])) {
                continue;
            }
            if (null !== $this->notifications->findOneByTitle($user, $store, CustomerNotification::TYPE_WANT_LIST_MATCH, $title)) {
                continue;
            }

            $notification = (new CustomerNotification())
                ->setUser($user)
                ->setStore($store)
                ->setType(CustomerNotification::TYPE_WANT_LIST_MATCH)
                ->setTitle($title)
                ->setBody($body);

            $this->entityManager->persist($notification);
            $notified[$user->getId()] = true;
        }
    }
}
