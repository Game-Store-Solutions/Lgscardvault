<?php

namespace App\Service\Recommend;

use App\Entity\Card;
use App\Entity\Store;
use App\Service\CaseCards\ColorIdentityParser;
use App\Service\CaseCards\SectionSerializer;
use App\Service\Recommend\Intelligence\CandidateGenerator;
use App\Service\Recommend\Intelligence\CommanderIntelligence;
use App\Service\Recommend\Intelligence\CommanderIntelligenceProvider;
use App\Service\Recommend\Intelligence\DeckContextAnalyzer;
use App\Service\Recommend\Intelligence\RecommendationEngine;
use App\Service\Recommend\Intelligence\ScoredCard;
use App\Service\Recommend\Intelligence\StrategyClassifier;
use App\Service\Recommend\Intelligence\StrategyTaxonomy;

/**
 * Commander deck builder recommendations.
 *
 * The pipeline this orchestrates:
 *
 *   commander → strategy → reference decks → card relationships
 *             → existing deck → best next cards
 *
 * Reference statistics are precomputed by CommanderIntelligenceRefresher, so
 * this class does indexed reads plus in-memory scoring. Candidates come from the
 * reference sample *and* store stock, so a card that belongs in the deck is
 * recommended and flagged as unstocked rather than silently dropped — stock is a
 * signal here, not a filter.
 */
final class CommanderRecommender
{
    private const DEFAULT_LIMIT = 80;
    private const MAX_LIMIT = 120;
    private const PER_ROLE_CAP = 36;
    private const PER_TYPE_CAP = 40;

    public function __construct(
        private readonly ColorIdentityParser $colorIdentity,
        private readonly SectionSerializer $sectionSerializer,
        private readonly StrategyCatalog $strategies,
        private readonly StrategyTaxonomy $taxonomy,
        private readonly StrategyClassifier $classifier,
        private readonly CommanderIntelligenceProvider $intelligenceProvider,
        private readonly CandidateGenerator $candidates,
        private readonly RecommendationEngine $engine,
        private readonly DeckContextAnalyzer $deckAnalyzer,
        private readonly ThemeTokenizer $tokenizer,
        private readonly RecommendListingCatalog $listingCatalog,
    ) {
    }

    /**
     * Strategies this commander can be built around.
     *
     * Merges what we have actually observed in reference decks with what the
     * commander's own text suggests. Observed strategies rank first and carry
     * real deck counts; text-derived ones fill in for commanders we have not
     * harvested yet, so the picker is never empty.
     *
     * @return list<array{id: string, label: string, description: string, confidence: float, matchedSignals: list<string>, deckCount: int, sampleSize: int, source: string}>
     */
    public function strategiesFor(Card $commander): array
    {
        $out = [];

        foreach ($this->intelligenceProvider->observedStrategies($commander) as $observed) {
            $out[$observed['id']] = [
                'id' => $observed['id'],
                'label' => $observed['label'],
                'description' => $observed['description'],
                'confidence' => round($observed['confidence'], 3),
                'matchedSignals' => [sprintf('%d of %d reference decks', $observed['deckCount'], max(1, $observed['sampleSize']))],
                'deckCount' => $observed['deckCount'],
                'sampleSize' => $observed['sampleSize'],
                'source' => $observed['source'],
            ];
        }

        foreach ($this->classifier->classifyCommander($commander) as $detected) {
            $id = $detected['id'];
            if (isset($out[$id])) {
                continue;
            }
            $out[$id] = [
                'id' => $id,
                'label' => $this->taxonomy->label($id),
                'description' => $this->taxonomy->description($id),
                'confidence' => round($detected['score'], 3),
                'matchedSignals' => $detected['signals'],
                'deckCount' => 0,
                'sampleSize' => 0,
                'source' => $detected['source'],
            ];
        }

        $ranked = array_values($out);
        // Provenance leads, then how many decks back it up. A label a deck's own
        // author wrote is better evidence than one we inferred from card text,
        // even when the inferred one matches more decks — text matching is loose
        // enough that a broad theme can otherwise shadow the real archetype.
        $provenanceRank = static fn (array $row): int => match ($row['source'] ?? '') {
            'provider' => 3,
            'classifier' => 2,
            default => 1,
        };
        usort($ranked, static function (array $a, array $b) use ($provenanceRank): int {
            return ($provenanceRank($b) <=> $provenanceRank($a))
                ?: ($b['deckCount'] <=> $a['deckCount'])
                ?: ($b['confidence'] <=> $a['confidence'])
                ?: strcmp((string) $a['id'], (string) $b['id']);
        });

        return $ranked;
    }

    /**
     * @param list<string> $deckOracleIds cards already in the user's deck, which
     *                                    is what makes recommendations move as
     *                                    the deck is edited
     *
     * @return array<string, mixed>
     */
    public function recommendForStore(
        ?Store $store,
        Card $commander,
        ?string $strategyId = null,
        int $limit = self::DEFAULT_LIMIT,
        array $deckOracleIds = [],
        bool $includeOutOfStock = true,
    ): array {
        $limit = max(1, min(self::MAX_LIMIT, $limit));
        $supported = $this->strategiesFor($commander);
        $selectedId = $this->resolveStrategyId($commander, $strategyId, $supported);

        $intelligence = $this->intelligenceProvider->forCommander($commander, $selectedId);
        $deckContext = $this->deckAnalyzer->analyze($deckOracleIds, $selectedId);

        $generated = $this->candidates->generate(
            $store,
            $commander,
            $intelligence,
            $deckOracleIds,
            $includeOutOfStock,
        );

        $scored = $this->engine->score(
            $commander,
            $selectedId,
            $intelligence,
            $deckContext,
            $generated['candidates'],
            $generated['stockByOracle'],
        );

        $rows = [];
        foreach (array_slice($scored, 0, $limit) as $card) {
            $rows[] = $this->serialize($card);
        }

        $this->listingCatalog->attachInventoryOptions($store, $rows);

        return [
            'commander' => [
                'id' => (string) $commander->getId(),
                'oracleId' => (string) $commander->getOracleId(),
                'name' => $commander->getName(),
                'typeLine' => $commander->getTypeLine(),
                'manaCost' => $commander->getManaCost(),
                'cmc' => $commander->getCmc(),
                'colorIdentity' => $commander->getColorIdentity() ?? [],
                'imageUrl' => $commander->getImageUrl(),
                'themes' => $this->tokenizer->tokenize($commander),
            ],
            'colorIdentity' => $commander->getColorIdentity() ?? [],
            'identityCode' => $this->colorIdentity->identityCode($commander->getColorIdentity()),
            'strategies' => $supported,
            'strategy' => [
                'id' => $selectedId,
                'label' => $this->taxonomy->label($selectedId),
                'description' => $this->taxonomy->description($selectedId),
            ],
            // Provenance travels with the payload so the UI can be honest about
            // a thin sample instead of presenting it as authoritative.
            'intelligence' => $intelligence->toArray(),
            'deckContext' => $deckContext->toArray(),
            'totalCandidates' => count($scored),
            'consideredCards' => $generated['consideredCount'],
            'excludedByLegality' => $generated['rejected'],
            'recommendations' => $rows,
            'byRole' => $this->groupByRole($rows),
            'byType' => $this->groupByType($rows),
        ];
    }

    /**
     * Score a single candidate list without store context, for the assembler and
     * for tests.
     *
     * @param list<string> $deckOracleIds
     *
     * @return list<ScoredCard>
     */
    public function scoreCandidates(
        ?Store $store,
        Card $commander,
        string $strategyId,
        array $deckOracleIds = [],
        bool $includeOutOfStock = true,
    ): array {
        $intelligence = $this->intelligenceProvider->forCommander($commander, $strategyId);
        $deckContext = $this->deckAnalyzer->analyze($deckOracleIds, $strategyId);
        $generated = $this->candidates->generate($store, $commander, $intelligence, $deckOracleIds, $includeOutOfStock);

        return $this->engine->score(
            $commander,
            $strategyId,
            $intelligence,
            $deckContext,
            $generated['candidates'],
            $generated['stockByOracle'],
        );
    }

    /**
     * Resolve the requested strategy, rejecting anything this commander cannot
     * support so a typo produces a 422 rather than a plausible-looking list of
     * unrelated cards.
     *
     * @param list<array{id: string}> $supported
     */
    private function resolveStrategyId(Card $commander, ?string $requested, array $supported): string
    {
        $ids = array_column($supported, 'id');

        if (null === $requested || '' === trim($requested)) {
            return $ids[0] ?? StrategyTaxonomy::FALLBACK_ID;
        }

        $normalized = $this->taxonomy->normalizeTag($requested) ?? $requested;
        if (!$this->taxonomy->has($normalized)) {
            throw new \InvalidArgumentException(sprintf('Unknown strategy "%s".', $requested));
        }
        if (StrategyTaxonomy::FALLBACK_ID !== $normalized && !in_array($normalized, $ids, true)) {
            throw new \InvalidArgumentException(sprintf(
                'Strategy "%s" is not supported by %s.',
                $requested,
                $commander->getName(),
            ));
        }

        return $normalized;
    }

    /** @return array<string, mixed> */
    private function serialize(ScoredCard $card): array
    {
        $item = $card->inventoryItem;

        return [
            'score' => $card->score,
            'confidence' => round($card->confidence, 3),
            // Strategy-package role, which is what the UI groups by.
            'role' => $card->strategyRole,
            'roles' => $card->strategyRoles,
            // Structural deck roles (ramp/draw/removal/...) — a card can fill
            // several, and often should.
            'deckRoles' => $card->roles,
            'packageComponents' => $card->packageComponents,
            'cardType' => $card->cardType(),
            'reasons' => $card->reasons,
            'signals' => $card->signals,
            'scoreBreakdown' => $card->components,
            'inStock' => $card->isInStock(),
            'stockQuantity' => $card->stockQuantity,
            'priceCents' => $card->priceCents,
            'card' => [
                'id' => (string) $card->profile->card->getId(),
                'oracleId' => $card->oracleId(),
                'name' => $card->profile->name,
                'typeLine' => $card->profile->card->getTypeLine(),
                'manaCost' => $card->profile->card->getManaCost(),
                'cmc' => $card->profile->cmc,
                'colorIdentity' => $card->profile->colorIdentity,
                'imageUrl' => $card->profile->card->getImageUrl(),
                'edhrecRank' => $card->profile->edhrecRank,
                'gameChanger' => $card->profile->isGameChanger,
            ],
            'inventoryItem' => null !== $item ? $this->sectionSerializer->serializeInventoryItem($item) : null,
        ];
    }

    /**
     * @param list<array<string, mixed>> $rows
     *
     * @return array<string, list<array<string, mixed>>>
     */
    private function groupByRole(array $rows): array
    {
        $groups = [
            StrategyCatalog::ROLE_ENABLER => [],
            StrategyCatalog::ROLE_FUEL => [],
            StrategyCatalog::ROLE_PAYOFF => [],
            StrategyCatalog::ROLE_SUPPORT => [],
        ];
        foreach ($rows as $row) {
            $role = (string) ($row['role'] ?? StrategyCatalog::ROLE_SUPPORT);
            if (!isset($groups[$role])) {
                $role = StrategyCatalog::ROLE_SUPPORT;
            }
            if (count($groups[$role]) >= self::PER_ROLE_CAP) {
                continue;
            }
            $groups[$role][] = $row;
        }

        return $groups;
    }

    /**
     * @param list<array<string, mixed>> $rows
     *
     * @return array<string, list<array<string, mixed>>>
     */
    private function groupByType(array $rows): array
    {
        $groups = [];
        foreach (StrategyCatalog::CARD_TYPES as $type) {
            $groups[$type] = [];
        }
        foreach ($rows as $row) {
            $type = (string) ($row['cardType'] ?? 'other');
            if (!isset($groups[$type])) {
                $type = 'other';
            }
            if (count($groups[$type]) >= self::PER_TYPE_CAP) {
                continue;
            }
            $groups[$type][] = $row;
        }

        return $groups;
    }
}
