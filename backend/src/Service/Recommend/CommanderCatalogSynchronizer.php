<?php

namespace App\Service\Recommend;

use App\Entity\Card;
use App\Entity\Commander;
use App\Repository\CardRepository;
use App\Repository\CommanderRepository;
use App\Service\Scryfall\ScryfallCardUpserter;
use App\Service\Scryfall\ScryfallClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Refreshes the local commanders table from Scryfall `is:commander`.
 *
 * One representative printing per oracle identity is upserted into `cards`,
 * then mirrored into `commanders`. Rows absent from the latest pass are
 * removed so the table stays a clean legal-commander list.
 */
final class CommanderCatalogSynchronizer
{
    public const SCRYFALL_QUERY = 'is:commander';

    public function __construct(
        private readonly ScryfallClient $scryfall,
        private readonly ScryfallCardUpserter $cardUpserter,
        private readonly CardRepository $cards,
        private readonly CommanderRepository $commanders,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /**
     * @return array{upserted: int, removed: int, pages: int}
     */
    public function sync(?callable $onPage = null): array
    {
        /** @var array<string, true> $seenOracleIds */
        $seenOracleIds = [];
        $upserted = 0;
        $pages = 0;

        foreach ($this->scryfall->iterateSearchPages(self::SCRYFALL_QUERY, 'cards') as $batch) {
            ++$pages;
            $this->cardUpserter->upsertMany($batch);
            // Native upsert bypasses the identity map — drop it before mirroring.
            $this->entityManager->clear();

            foreach ($batch as $cardData) {
                $oracleId = Uuid::fromString((string) $cardData['oracle_id']);
                $cardId = Uuid::fromString((string) $cardData['id']);
                $seenOracleIds[(string) $oracleId] = true;

                $card = $this->cards->find($cardId);
                if (!$card instanceof Card) {
                    continue;
                }

                $commander = $this->commanders->find($oracleId);
                if (!$commander instanceof Commander) {
                    $commander = new Commander($oracleId, $card);
                    $this->entityManager->persist($commander);
                }
                $commander->syncFromCard($card);
                ++$upserted;
            }

            $this->entityManager->flush();
            $this->entityManager->clear();

            if (null !== $onPage) {
                $onPage($pages, count($batch), $upserted);
            }
        }

        $removed = $this->commanders->deleteNotInOracleIds(array_keys($seenOracleIds));

        return [
            'upserted' => $upserted,
            'removed' => $removed,
            'pages' => $pages,
        ];
    }
}
