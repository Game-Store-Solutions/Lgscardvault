<?php

namespace App\Service\Inventory;

use App\Entity\Card;
use App\Entity\Game;
use App\Entity\InventoryItem;
use App\Repository\CardRepository;
use App\Repository\GameRepository;
use App\Repository\InventoryItemRepository;
use App\Service\Catalog\FinishVocabulary;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Re-homes inventory left behind by the era when non-Magic imports failed.
 *
 * Before games existed as data, a failed One Piece row could only be
 * recovered through the Magic pipeline, which created a game-less card and
 * stamped "Game: One Piece Card Game" into the listing's notes. Those
 * listings are mislabeled at the ROW level: they sit on the Magic shelf,
 * count toward Magic's stats, and are invisible to their own game's
 * workspace — no amount of query scoping can fix that, because the rows
 * really do say Magic.
 *
 * For each such listing this finds the real catalog card in the named game
 * (collector-number-first, same matcher imports use) and re-points the
 * listing at it — merging into an existing line when one already holds that
 * printing. When the catalog has no match (game never synced), the
 * game-less card is tagged with the game instead, so the listing at least
 * lives on the right shelf; a card that carries Scryfall data is left
 * untouched and reported, since that one really is a Magic card and
 * re-tagging it would corrupt every other reference to it.
 */
final readonly class LegacyGameLinkRepairer
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private InventoryItemRepository $inventoryItems,
        private CardRepository $cards,
        private GameRepository $games,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * @return array{repointed: int, retagged: int, merged: int, unresolved: list<string>}
     */
    public function repair(bool $dryRun = false): array
    {
        $report = ['repointed' => 0, 'retagged' => 0, 'merged' => 0, 'unresolved' => []];

        // Rows this run has already moved, keyed by the unique tuple they now
        // occupy. Repeated failed-import rounds left SEVERAL duplicates of
        // the same printing; they all re-point to one catalog line in one
        // run, and a database lookup cannot see a sibling that moved a
        // moment ago in the same unit of work — without this map the flush
        // dies on the unique key.
        /** @var array<string, InventoryItem> $occupied */
        $occupied = [];

        foreach ($this->inventoryItems->findLegacyGameNoted() as $item) {
            $gameName = $this->gameNameFromNotes((string) $item->getNotes());
            $game = null === $gameName ? null : $this->resolveGame($gameName);
            $card = $item->getCard();

            if (null === $game || !$card instanceof Card) {
                continue;
            }

            $catalogCard = $this->cards->findOneForGame(
                $game,
                $card->getName(),
                $card->getSetCode(),
                $card->getCollectorNumber(),
            );

            if ($catalogCard instanceof Card && !$catalogCard->getId()->equals($card->getId())) {
                $this->repoint($item, $catalogCard, $occupied, $report, $dryRun);
                continue;
            }

            if (null !== $card->getScryfallData()) {
                // A real Magic card was matched by name back then; re-tagging
                // it would drag every other listing of it out of Magic.
                $report['unresolved'][] = sprintf(
                    'item #%d "%s": no %s catalog match, and its card is a real Magic printing — sync the %s catalog and re-run',
                    $item->getId(),
                    $card->getName(),
                    $game->getName(),
                    $game->getName(),
                );
                continue;
            }

            if (!$dryRun) {
                $card->setGame($game);
                $item->applyFinish(FinishVocabulary::resolveForCard($card, null, $item->isFoil()));
            }
            $occupied[$this->tupleKey($item->getStore()?->getId(), $card, $item)] = $item;
            ++$report['retagged'];
        }

        if (!$dryRun) {
            $this->entityManager->flush();
        }

        $this->logger->info('Legacy game-link repair finished', $report + ['dryRun' => $dryRun]);

        return $report;
    }

    /**
     * Moves the listing onto the real catalog card, folding it into an
     * existing line when the store already stocks that printing in the same
     * condition and finish.
     *
     * @param array{repointed: int, retagged: int, merged: int, unresolved: list<string>} $report
     */
    /** @param array<string, InventoryItem> $occupied */
    private function repoint(InventoryItem $item, Card $catalogCard, array &$occupied, array &$report, bool $dryRun): void
    {
        $finish = FinishVocabulary::resolveForCard($catalogCard, null, $item->isFoil());
        $key = sprintf(
            '%s|%s|%s|%s',
            $item->getStore()?->getId(),
            $catalogCard->getId()->toRfc4122(),
            $item->getCondition()->value,
            $finish,
        );

        // A sibling repaired earlier this run wins the tuple; the database
        // is only consulted for lines that predate the run.
        $existing = $occupied[$key] ?? $this->inventoryItems->findOneBy([
            'store' => $item->getStore(),
            'card' => $catalogCard,
            'condition' => $item->getCondition(),
            'finish' => $finish,
        ]);

        if ($existing instanceof InventoryItem && $existing->getId() !== $item->getId()) {
            if (!$dryRun) {
                $existing->setQuantity($existing->getQuantity() + $item->getQuantity());
                $this->entityManager->remove($item);
            }
            $occupied[$key] = $existing;
            ++$report['merged'];

            return;
        }

        if (!$dryRun) {
            $item->setCard($catalogCard);
            $item->applyFinish($finish);
        }
        $occupied[$key] = $item;
        ++$report['repointed'];
    }

    /** The unique tuple a retagged item now occupies (its card kept, finish re-resolved). */
    private function tupleKey(?int $storeId, Card $card, InventoryItem $item): string
    {
        return sprintf(
            '%s|%s|%s|%s',
            $storeId,
            $card->getId()->toRfc4122(),
            $item->getCondition()->value,
            $item->getFinish(),
        );
    }

    /** The note line the old recovery path wrote: "Game: One Piece Card Game". */
    private function gameNameFromNotes(string $notes): ?string
    {
        if (1 !== preg_match('/^Game:\s*(.+)$/mi', $notes, $matches)) {
            return null;
        }

        $name = trim($matches[1]);

        return '' !== $name ? $name : null;
    }

    /** The sheet wrote whatever the seller typed, so match name loosely. */
    private function resolveGame(string $name): ?Game
    {
        $needle = mb_strtolower(trim($name));

        foreach ($this->games->findAll() as $game) {
            $gameName = mb_strtolower($game->getName());
            if ($needle === $gameName || $needle === mb_strtolower($game->getCode())) {
                return $game;
            }
            // "One Piece" vs the catalog's "One Piece Card Game".
            if (str_contains($gameName, $needle) || str_contains($needle, $gameName)) {
                return $game;
            }
        }

        return null;
    }
}
