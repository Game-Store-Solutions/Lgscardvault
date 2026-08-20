<?php

namespace App\Service\Recommend\Intelligence;

use App\Repository\ReferenceDeckRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Drops stale reference decklists once their aggregates have had time to settle.
 *
 * Live recommendations still need a membership matrix, so we only prune decks
 * whose `fetchedAt` is older than the retention window. Active commanders are
 * re-harvested by the weekly intelligence sweep (which refreshes `fetchedAt`),
 * so what gets deleted are orphans and abandoned commanders — not the working
 * set behind current scores.
 */
final class ReferenceDeckPruner
{
    public function __construct(
        private readonly ReferenceDeckRepository $referenceDecks,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly int $pruneAgeDays = 120,
        private readonly int $batchSize = 500,
        private readonly bool $deleteDeckHeaders = true,
    ) {
    }

    /**
     * @return array{decks: int, cards: int}
     */
    public function prune(?int $batchSize = null): array
    {
        $limit = max(1, $batchSize ?? $this->batchSize);
        $cutoff = new \DateTimeImmutable(sprintf('-%d days', max(1, $this->pruneAgeDays)));
        $deckIds = $this->referenceDecks->findPrunableDeckIds($cutoff, $limit);
        if ([] === $deckIds) {
            return ['decks' => 0, 'cards' => 0];
        }

        $cardsDeleted = $this->referenceDecks->deleteCardsForDeckIds($deckIds);
        $decksDeleted = 0;
        if ($this->deleteDeckHeaders) {
            $decksDeleted = $this->referenceDecks->deleteDecksByIds($deckIds);
        }

        $this->em->clear();

        $this->logger->info('Pruned {decks} reference decks ({cards} card rows) older than {days} days.', [
            'decks' => $decksDeleted > 0 ? $decksDeleted : count($deckIds),
            'cards' => $cardsDeleted,
            'days' => $this->pruneAgeDays,
        ]);

        return [
            'decks' => $decksDeleted > 0 ? $decksDeleted : count($deckIds),
            'cards' => $cardsDeleted,
        ];
    }
}
