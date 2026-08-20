<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;
use App\Service\Recommend\StrategyCatalog;
use App\Service\Recommend\ThemeTokenizer;

/**
 * Strategy affinity from card text alone, for cards no reference deck covers.
 *
 * This is the bottom rung of the fallback ladder and it is intentionally the
 * behaviour the recommender had before reference decks existed: theme-tag
 * overlap with the commander plus strategy signal matching. Keeping it means a
 * brand-new commander, or a card too fringe to appear in any harvested list,
 * still gets a sensible score instead of a zero.
 */
final class ThemeAffinityScorer
{
    /** Signal matches treated as full strategy saturation. */
    private const SATURATION_MATCHES = 3;

    public function __construct(
        private readonly StrategyTaxonomy $taxonomy,
        private readonly StrategyCatalog $catalog,
        private readonly ThemeTokenizer $tokenizer,
    ) {
    }

    public function label(string $strategyId): string
    {
        return $this->taxonomy->label($strategyId);
    }

    /**
     * Affinity in 0..1, blending two weak-but-real signals: how many of the
     * strategy's own signals the card matches, and how much its theme tags
     * overlap the commander's.
     */
    public function affinity(Card $commander, CardProfile $profile, string $strategyId): float
    {
        $matches = $this->signalMatches($profile, $strategyId);
        $signalScore = min(1.0, $matches / self::SATURATION_MATCHES);

        $overlap = $this->tokenizer->overlap(
            $this->tokenizer->tokenize($commander),
            $profile->tags,
        );

        // Signal matching is the more specific of the two, so it leads.
        $score = (0.7 * $signalScore) + (0.3 * $overlap['score']);

        // A card that also lands a role in the curated catalog definition is
        // more than incidentally on-theme.
        $strategy = $this->catalog->get($strategyId);
        if (null !== $strategy) {
            $classification = $this->catalog->classifyCard($profile->card, $strategy, $this->tokenizer);
            if ([] !== $classification['reasons']) {
                $score += 0.15;
            }
        }

        return max(0.0, min(1.0, $score));
    }

    private function signalMatches(CardProfile $profile, string $strategyId): int
    {
        $matches = 0;
        foreach ($this->taxonomy->tags($strategyId) as $tag) {
            if ($profile->hasAnyTag($tag)) {
                ++$matches;
            }
        }
        foreach ($this->taxonomy->needles($strategyId) as $needle) {
            if ($profile->matchesAnyNeedle([$needle])) {
                ++$matches;
            }
        }

        // Package needles describe the strategy's actual engine pieces, so a
        // match there is the strongest text signal available.
        foreach ($this->taxonomy->package($strategyId) as $definition) {
            if ($profile->matchesAnyNeedle($definition['needles'])) {
                ++$matches;
                break;
            }
        }

        return $matches;
    }
}
