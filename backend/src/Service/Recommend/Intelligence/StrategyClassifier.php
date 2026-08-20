<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;
use App\Entity\CommanderStrategyStat;
use App\Service\Recommend\Provider\ReferenceDeckPayload;
use App\Service\Recommend\StrategyCatalog;
use App\Service\Recommend\ThemeTokenizer;

/**
 * Assigns strategy labels to reference decks and to commanders.
 *
 * Strategies are not mutually exclusive: a deck gets a ranked list, so an Anim
 * Pakal list can be primarily Tokens, secondarily +1/+1 Counters, and support
 * Humans and Combat at the same time.
 *
 * Two signals, in priority order:
 *
 *  1. Provider tags. Builder-authored and far better than anything we could
 *     infer — an Archidekt deck tagged "Tokens" is a tokens deck.
 *  2. Composition. Roughly a third of harvested decks carry no tags at all, so
 *     without this fallback we would silently discard them. We measure what
 *     share of the deck's nonland cards match each strategy's signals.
 */
final class StrategyClassifier
{
    /**
     * A strategy needs this share of the deck's nonland cards before
     * composition alone will name it. Below this we are reading noise: almost
     * every deck contains a couple of cards that mention tokens or counters.
     */
    private const MIN_COMPOSITION_SHARE = 0.10;

    /** Composition share treated as total saturation. */
    private const SATURATION_SHARE = 0.35;

    private const MAX_STRATEGIES_PER_DECK = 5;

    /** Relative influence of the two signals when both are present. */
    private const PROVIDER_WEIGHT = 0.65;
    private const COMPOSITION_WEIGHT = 0.35;

    public function __construct(
        private readonly StrategyTaxonomy $taxonomy,
        private readonly CardProfileIndex $profiles,
        private readonly StrategyCatalog $catalog,
        private readonly ThemeTokenizer $tokenizer,
    ) {
    }

    /**
     * Rank the strategies a reference deck represents.
     *
     * @return list<array{id: string, score: float, source: string, signals: list<string>}>
     */
    public function classifyDeck(ReferenceDeckPayload $deck): array
    {
        $providerSlugs = $this->taxonomy->normalizeTags($deck->providerTags);
        $composition = $this->compositionShares($deck->oracleIds());

        $candidates = array_unique(array_merge($providerSlugs, array_keys($composition)));
        $ranked = [];

        foreach ($candidates as $slug) {
            $tagged = in_array($slug, $providerSlugs, true);
            $share = $composition[$slug] ?? 0.0;
            $compositionScore = min(1.0, $share / self::SATURATION_SHARE);

            // A provider tag is enough on its own. Composition on its own must
            // clear the noise floor.
            if (!$tagged && $share < self::MIN_COMPOSITION_SHARE) {
                continue;
            }

            $score = $tagged
                ? (self::PROVIDER_WEIGHT + (self::COMPOSITION_WEIGHT * $compositionScore))
                : (self::COMPOSITION_WEIGHT * $compositionScore);

            $signals = [];
            if ($tagged) {
                $signals[] = 'provider tag';
            }
            if ($share > 0.0) {
                $signals[] = sprintf('%d%% of nonland cards match', (int) round($share * 100));
            }

            $ranked[] = [
                'id' => $slug,
                'score' => round(min(1.0, $score), 4),
                'source' => $tagged ? CommanderStrategyStat::SOURCE_PROVIDER : CommanderStrategyStat::SOURCE_CLASSIFIER,
                'signals' => $signals,
            ];
        }

        usort($ranked, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        return array_slice($ranked, 0, self::MAX_STRATEGIES_PER_DECK);
    }

    /**
     * Strategies a commander can plausibly support, from its own text alone.
     *
     * The floor of the fallback ladder: used when we hold no reference decks at
     * all, and merged with observed data when we do. Delegates to the existing
     * StrategyCatalog detection and maps its ids onto taxonomy slugs so both
     * paths speak the same vocabulary.
     *
     * @return list<array{id: string, score: float, source: string, signals: list<string>}>
     */
    public function classifyCommander(Card $commander): array
    {
        $out = [];
        foreach ($this->catalog->strategiesForCommander($commander, $this->tokenizer) as $detected) {
            $slug = $this->taxonomy->normalizeTag((string) $detected['id']) ?? (string) $detected['id'];
            if (!$this->taxonomy->has($slug)) {
                continue;
            }
            if (isset($out[$slug])) {
                continue;
            }
            $out[$slug] = [
                'id' => $slug,
                'score' => (float) $detected['confidence'],
                'source' => CommanderStrategyStat::SOURCE_CATALOG,
                'signals' => array_values(array_map('strval', $detected['matchedSignals'])),
            ];
        }

        // Commander text is a weaker signal than a real decklist, so a
        // taxonomy-wide sweep of its oracle text catches themes the curated
        // catalog does not model (it covers ten strategies; the taxonomy covers
        // every archetype providers actually tag).
        $profile = $this->profiles->remember($commander);
        foreach ($this->taxonomy->slugs() as $slug) {
            if (isset($out[$slug]) || StrategyTaxonomy::FALLBACK_ID === $slug) {
                continue;
            }
            $signal = $this->matchSignal($profile, $slug);
            if (null === $signal) {
                continue;
            }
            $out[$slug] = [
                'id' => $slug,
                'score' => 0.45,
                'source' => CommanderStrategyStat::SOURCE_CATALOG,
                'signals' => [$signal],
            ];
        }

        $ranked = array_values($out);
        usort($ranked, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        if ([] === $ranked) {
            $ranked[] = [
                'id' => StrategyTaxonomy::FALLBACK_ID,
                'score' => 0.4,
                'source' => CommanderStrategyStat::SOURCE_CATALOG,
                'signals' => [],
            ];
        }

        return $ranked;
    }

    /**
     * Share of a deck's nonland cards matching each strategy's signals.
     *
     * Lands are excluded from the denominator because every deck is ~36% lands;
     * including them would compress every share toward zero and make the noise
     * floor meaningless.
     *
     * @param list<string> $oracleIds
     *
     * @return array<string, float>
     */
    private function compositionShares(array $oracleIds): array
    {
        $profiles = $this->profiles->getMany($oracleIds);
        $nonLand = array_filter($profiles, static fn (CardProfile $p): bool => !$p->isLand);
        $total = count($nonLand);
        if ($total < 1) {
            return [];
        }

        $counts = [];
        foreach ($nonLand as $profile) {
            foreach ($this->taxonomy->slugs() as $slug) {
                if (StrategyTaxonomy::FALLBACK_ID === $slug) {
                    continue;
                }
                if (null !== $this->matchSignal($profile, $slug)) {
                    $counts[$slug] = ($counts[$slug] ?? 0) + 1;
                }
            }
        }

        $shares = [];
        foreach ($counts as $slug => $count) {
            $shares[$slug] = $count / $total;
        }
        arsort($shares);

        return $shares;
    }

    /** The first taxonomy signal a card matches for a strategy, if any. */
    private function matchSignal(CardProfile $profile, string $slug): ?string
    {
        foreach ($this->taxonomy->tags($slug) as $tag) {
            if ($profile->hasAnyTag($tag)) {
                return $tag;
            }
        }

        return $profile->firstMatchingNeedle($this->taxonomy->needles($slug));
    }
}
