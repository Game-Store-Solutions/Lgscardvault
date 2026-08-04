<?php

namespace App\Service\Recommend;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Repository\CardSynergyRepository;
use App\Repository\InventoryItemRepository;
use App\Service\CaseCards\ColorIdentityParser;
use App\Service\CaseCards\SectionSerializer;

/**
 * Store-scoped commander recommendations.
 *
 * Pipeline: candidate generation from the store's in-stock Magic inventory →
 * color-identity / legality / self filters → weighted ranking (theme overlap,
 * persisted synergy edges, mana-curve fit, inventory availability) → top N
 * inventory listings the shopper can add to cart.
 */
final class CommanderRecommender
{
    private const DEFAULT_LIMIT = 24;
    private const MAX_LIMIT = 60;

    public function __construct(
        private readonly InventoryItemRepository $inventoryItems,
        private readonly CardSynergyRepository $synergies,
        private readonly ThemeTokenizer $tokenizer,
        private readonly ColorIdentityParser $colorIdentity,
        private readonly SectionSerializer $sectionSerializer,
    ) {
    }

    /**
     * @return array{
     *   commander: array<string, mixed>,
     *   colorIdentity: list<string>,
     *   identityCode: string,
     *   totalCandidates: int,
     *   recommendations: list<array<string, mixed>>
     * }
     */
    public function recommendForStore(Store $store, Card $commander, int $limit = self::DEFAULT_LIMIT): array
    {
        $limit = max(1, min(self::MAX_LIMIT, $limit));
        $commanderTags = $this->tokenizer->tokenize($commander);
        $commanderOracle = $commander->getOracleId();
        $edgeWeights = $this->synergies->weightsForOracle($commanderOracle);
        $commanderCmc = $commander->getCmc() ?? 0.0;

        $candidates = $this->inventoryItems->findInStockMagicForStore($store);
        $ranked = [];
        foreach ($candidates as $item) {
            $card = $item->getCard();
            if (!$card instanceof Card) {
                continue;
            }
            if ((string) $card->getOracleId() === (string) $commanderOracle) {
                continue;
            }
            if (!$this->colorIdentity->isSubsetOf($commander->getColorIdentity(), $card->getColorIdentity())) {
                continue;
            }
            if (!$this->isCommanderLegal($card)) {
                continue;
            }

            $cardTags = $this->tokenizer->tokenize($card);
            $overlap = $this->tokenizer->overlap($commanderTags, $cardTags);
            $oracleKey = (string) $card->getOracleId();
            $edge = $edgeWeights[$oracleKey] ?? null;
            $edgeWeight = $edge['weight'] ?? 0.0;
            $edgeTags = $edge['tags'] ?? [];

            $curveFit = $this->curveFit($commanderCmc, $card->getCmc());
            $stockBoost = min(0.15, 0.03 * min(5, $item->getQuantity()));
            $themeScore = $overlap['score'];

            // Weighted blend — theme + persisted edges dominate; stock nudges ties.
            $score = (0.45 * $themeScore)
                + (0.30 * $edgeWeight)
                + (0.15 * $curveFit)
                + (0.10 * ($stockBoost / 0.15));

            // Always surface legal in-stock cards, but require *some* signal
            // unless the inventory is tiny (demo / sparse stores).
            if ($score < 0.05 && count($candidates) > 12 && 0.0 === $themeScore && 0.0 === $edgeWeight) {
                continue;
            }

            $reasons = array_values(array_unique(array_merge($overlap['shared'], $edgeTags)));
            $ranked[] = [
                'score' => round($score, 4),
                'reasons' => $reasons,
                'inventoryItem' => $this->sectionSerializer->serializeInventoryItem($item),
            ];
        }

        usort($ranked, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        // Deduplicate by oracle id — keep the highest-scoring (usually cheapest
        // / best-condition) listing per card name identity.
        $seenOracle = [];
        $deduped = [];
        foreach ($ranked as $row) {
            $oracle = (string) ($row['inventoryItem']['card']['oracleId'] ?? '');
            if ('' !== $oracle && isset($seenOracle[$oracle])) {
                continue;
            }
            if ('' !== $oracle) {
                $seenOracle[$oracle] = true;
            }
            $deduped[] = $row;
            if (count($deduped) >= $limit) {
                break;
            }
        }

        return [
            'commander' => [
                'id' => (string) $commander->getId(),
                'oracleId' => (string) $commanderOracle,
                'name' => $commander->getName(),
                'typeLine' => $commander->getTypeLine(),
                'manaCost' => $commander->getManaCost(),
                'cmc' => $commander->getCmc(),
                'colorIdentity' => $commander->getColorIdentity() ?? [],
                'imageUrl' => $commander->getImageUrl(),
                'themes' => $commanderTags,
            ],
            'colorIdentity' => $commander->getColorIdentity() ?? [],
            'identityCode' => $this->colorIdentity->identityCode($commander->getColorIdentity()),
            'totalCandidates' => count($ranked),
            'recommendations' => $deduped,
        ];
    }

    private function isCommanderLegal(Card $card): bool
    {
        $legalities = $card->getLegalities();
        if (!is_array($legalities) || !isset($legalities['commander'])) {
            // Unknown legality (sparse seed rows) — allow rather than hide stock.
            return true;
        }

        return in_array((string) $legalities['commander'], ['legal', 'restricted'], true);
    }

    private function curveFit(float $commanderCmc, ?float $cardCmc): float
    {
        if (null === $cardCmc) {
            return 0.4;
        }
        // Prefer mid/low curve pieces around the commander; lands/0-cost score OK.
        $delta = abs($cardCmc - max(2.0, $commanderCmc * 0.6));
        return max(0.0, 1.0 - ($delta / 6.0));
    }
}
