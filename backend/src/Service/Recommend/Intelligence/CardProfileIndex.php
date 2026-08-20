<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;
use App\Repository\CardRepository;
use App\Service\Recommend\StrategyCatalog;
use App\Service\Recommend\ThemeTokenizer;
use Symfony\Contracts\Service\ResetInterface;

/**
 * Request-scoped cache of CardProfile objects, loaded in bulk.
 *
 * Reference decks overlap heavily by design — that is the whole signal — so the
 * same oracle id shows up in most of the ten decks we analyse. Without this the
 * pipeline would re-query and re-tokenize identical cards repeatedly.
 *
 * Not a persistent cache: profiles are cheap once the rows are in hand, and
 * caching them across requests would go stale whenever the catalog is resynced.
 */
final class CardProfileIndex implements ResetInterface
{
    /** @var array<string, CardProfile|null> */
    private array $profiles = [];

    public function __construct(
        private readonly CardRepository $cards,
        private readonly ThemeTokenizer $tokenizer,
        private readonly StrategyCatalog $strategies,
    ) {
    }

    /**
     * Warm the index for a set of oracle ids in one query.
     *
     * Unresolvable ids are cached as null so a reference deck full of cards we
     * have never imported does not retry on every lookup.
     *
     * @param list<string> $oracleIds
     */
    public function preload(array $oracleIds): void
    {
        $missing = [];
        foreach ($oracleIds as $oracleId) {
            $key = $this->key($oracleId);
            if ('' !== $key && !array_key_exists($key, $this->profiles)) {
                $missing[$key] = true;
            }
        }
        if ([] === $missing) {
            return;
        }

        $cards = $this->cards->mapOneCardPerOracleId(array_keys($missing));
        foreach (array_keys($missing) as $key) {
            $card = $cards[$key] ?? null;
            $this->profiles[$key] = $card instanceof Card ? $this->build($key, $card) : null;
        }
    }

    public function get(string $oracleId): ?CardProfile
    {
        $key = $this->key($oracleId);
        if ('' === $key) {
            return null;
        }
        if (!array_key_exists($key, $this->profiles)) {
            $this->preload([$key]);
        }

        return $this->profiles[$key] ?? null;
    }

    /**
     * Register an already-loaded card so callers that hold entities (inventory
     * rows, the commander itself) do not trigger a redundant query.
     */
    public function remember(Card $card): CardProfile
    {
        $key = $this->key((string) $card->getOracleId());
        $existing = $this->profiles[$key] ?? null;
        if ($existing instanceof CardProfile) {
            return $existing;
        }

        return $this->profiles[$key] = $this->build($key, $card);
    }

    /**
     * @param list<string> $oracleIds
     *
     * @return array<string, CardProfile>
     */
    public function getMany(array $oracleIds): array
    {
        $this->preload($oracleIds);
        $out = [];
        foreach ($oracleIds as $oracleId) {
            $key = $this->key($oracleId);
            $profile = $this->profiles[$key] ?? null;
            if ($profile instanceof CardProfile) {
                $out[$key] = $profile;
            }
        }

        return $out;
    }

    /**
     * Drop cached profiles.
     *
     * These hold Card entities, so keeping them past the end of a request would
     * pin detached objects and hide catalog updates from a long-running worker.
     */
    public function reset(): void
    {
        $this->profiles = [];
    }

    private function build(string $oracleId, Card $card): CardProfile
    {
        $typeLine = strtolower($card->getTypeLine() ?? '');
        $haystack = strtolower(trim(implode("\n", array_filter([
            $card->getTypeLine() ?? '',
            $card->getOracleText() ?? '',
            implode(' ', $card->getKeywords() ?? []),
            $card->getName(),
        ]))));

        $isLand = str_contains($typeLine, 'land');

        return new CardProfile(
            oracleId: $oracleId,
            card: $card,
            name: $card->getName(),
            tags: $this->tokenizer->tokenize($card),
            haystack: $haystack,
            primaryType: $this->strategies->primaryCardType($card),
            cmc: $card->getCmc(),
            colorIdentity: $card->getColorIdentity() ?? [],
            edhrecRank: $card->getEdhrecRank(),
            isLand: $isLand,
            isBasicLand: $isLand && str_contains($typeLine, 'basic'),
            isGameChanger: $card->isGameChanger(),
        );
    }

    private function key(string $oracleId): string
    {
        return strtolower(trim($oracleId));
    }
}
