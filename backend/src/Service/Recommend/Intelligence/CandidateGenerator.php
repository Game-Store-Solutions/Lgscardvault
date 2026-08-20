<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Repository\InventoryItemRepository;

/**
 * Narrows the card universe to a scorable candidate set, cheaply, before any
 * expensive per-card work happens.
 *
 * The funnel:
 *
 *     all cards
 *       → cards the reference sample actually plays  (indexed read)
 *       + cards the store has in stock               (existing indexed read)
 *       → commander legal + inside color identity    (hard gate)
 *       → already in the deck removed
 *       → capped, ordered by precomputed base score
 *       → detailed scoring
 *
 * Two design points worth being explicit about:
 *
 * Stock is a *signal*, not a filter. Candidates come from the reference sample
 * as well as the shelf, so a card that belongs in the deck is recommended and
 * flagged as not stocked rather than silently omitted. Filtering by inventory
 * was the main reason the old builder drifted toward generic staples: the
 * candidate pool was ordered by EDHREC rank, so popularity *was* the pool.
 *
 * Legality is applied here rather than during scoring, so an illegal card is
 * never a candidate and cannot leak through a caller that forgets to check.
 */
final class CandidateGenerator
{
    /**
     * Ceiling on cards handed to the scorer. Reference samples contribute a few
     * hundred distinct cards; the rest is stock. Well above what any deck needs
     * and far below "score every card in Magic".
     */
    private const MAX_CANDIDATES = 900;

    /** Inventory rows pulled per request; the repository already caps at 4000. */
    private const STOCK_LIMIT = 4000;

    public function __construct(
        private readonly InventoryItemRepository $inventoryItems,
        private readonly CardProfileIndex $profiles,
        private readonly CommanderLegalityValidator $legality,
    ) {
    }

    /**
     * @param list<string> $excludeOracleIds cards already in the deck
     *
     * @return array{
     *   candidates: list<CardProfile>,
     *   stockByOracle: array<string, InventoryItem>,
     *   rejected: array<string, int>,
     *   consideredCount: int
     * }
     */
    public function generate(
        ?Store $store,
        Card $commander,
        CommanderIntelligence $intelligence,
        array $excludeOracleIds = [],
        bool $includeOutOfStock = true,
        bool $includeBasicLands = false,
    ): array {
        $stockByOracle = $this->loadStock($store, $commander);

        $excluded = [];
        foreach ($excludeOracleIds as $oracleId) {
            $excluded[strtolower((string) $oracleId)] = true;
        }

        // Union of the two sources, reference cards first so the ordering below
        // favours cards the archetype actually plays.
        $pool = [];
        foreach ($this->orderedReferenceOracleIds($intelligence) as $oracleId) {
            $pool[$oracleId] = true;
        }
        if ($includeOutOfStock || null !== $store) {
            foreach (array_keys($stockByOracle) as $oracleId) {
                $pool[$oracleId] = true;
            }
        }

        $poolIds = array_keys($pool);
        $considered = count($poolIds);

        // One bulk query for every card we might score.
        $this->profiles->preload($poolIds);

        $candidates = [];
        $rejected = [];
        foreach ($poolIds as $oracleId) {
            if (isset($excluded[$oracleId])) {
                continue;
            }
            if (!$includeOutOfStock && !isset($stockByOracle[$oracleId])) {
                continue;
            }

            $profile = $this->profiles->get($oracleId);
            if (null === $profile) {
                // A reference deck card we have never imported. Counted so the
                // caller can see catalog coverage gaps.
                $rejected['unknown_card'] = ($rejected['unknown_card'] ?? 0) + 1;
                continue;
            }

            // Basic lands are a deck-construction detail, not a recommendation —
            // nobody needs to be told to play Plains. They are also the cards
            // most likely to appear in every reference deck, so leaving them in
            // a browsing list would push them to the top on frequency alone.
            // Deck assembly opts back in, because it does have to build a mana
            // base.
            if (!$includeBasicLands && $profile->isBasicLand) {
                continue;
            }

            $reason = $this->legality->rejectionReason($commander, $profile->card);
            if (null !== $reason) {
                $rejected[$reason] = ($rejected[$reason] ?? 0) + 1;
                continue;
            }

            $candidates[$oracleId] = $profile;
            if (count($candidates) >= self::MAX_CANDIDATES) {
                break;
            }
        }

        return [
            'candidates' => array_values($candidates),
            'stockByOracle' => $stockByOracle,
            'rejected' => $rejected,
            'consideredCount' => $considered,
        ];
    }

    /**
     * Best in-stock listing per oracle identity for this commander's colors.
     *
     * Keyed by oracle id because recommendations are oracle-level while
     * inventory is per printing; the cheapest sufficient copy is the one a
     * shopper wants, and the repository already orders accordingly.
     *
     * @return array<string, InventoryItem>
     */
    public function loadStock(?Store $store, Card $commander): array
    {
        if (!$store instanceof Store) {
            return [];
        }

        $out = [];
        foreach ($this->inventoryItems->findRecommendationCandidates(
            $store,
            $commander->getColorIdentity() ?? [],
            self::STOCK_LIMIT,
        ) as $item) {
            $card = $item->getCard();
            if (!$card instanceof Card) {
                continue;
            }
            $key = strtolower((string) $card->getOracleId());
            if (!isset($out[$key])) {
                $out[$key] = $item;
                // Registering the entity here means scoring never re-queries a
                // card the inventory join already loaded.
                $this->profiles->remember($card);
            }
        }

        return $out;
    }

    /**
     * Reference cards ordered by precomputed base score, strongest first.
     *
     * @return list<string>
     */
    private function orderedReferenceOracleIds(CommanderIntelligence $intelligence): array
    {
        $stats = $intelligence->cardStats;
        // statsForScope() already returns base-score order; preserve it rather
        // than re-sorting a few hundred rows for nothing.
        return array_keys($stats);
    }
}
