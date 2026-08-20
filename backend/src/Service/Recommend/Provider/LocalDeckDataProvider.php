<?php

namespace App\Service\Recommend\Provider;

use App\Entity\Card;
use App\Entity\Deck;
use App\Repository\DeckRepository;
use App\Service\CaseCards\ColorIdentityParser;
use Symfony\Component\Uid\Uuid;

/**
 * Reference decks from lists our own users have saved.
 *
 * Small at first but strategically the most valuable source we have: it carries
 * no third-party terms, cannot be rate-limited or shut off, and compounds as the
 * platform is used.
 *
 * Saved decks have no explicit commander column, so a deck counts as a deck
 * "for" a commander when it contains that card and every other card sits inside
 * that commander's color identity. That is a strong enough signal in practice —
 * an off-color list is not a deck built around this commander.
 */
final class LocalDeckDataProvider implements DeckDataProviderInterface
{
    public const NAME = 'local';

    public function __construct(
        private readonly DeckRepository $decks,
        private readonly ColorIdentityParser $colorIdentity,
        private readonly bool $enabled = true,
    ) {
    }

    public function name(): string
    {
        return self::NAME;
    }

    public function isAvailable(): bool
    {
        return $this->enabled;
    }

    public function getDecksForCommander(string $commanderOracleId, string $commanderName, int $limit): array
    {
        return $this->getPopularDecks($commanderOracleId, $commanderName, null, $limit);
    }

    public function getDecksForCommanderAndStrategy(
        string $commanderOracleId,
        string $commanderName,
        string $strategyId,
        int $limit,
    ): array {
        // Saved decks carry no archetype tags; the caller's classifier infers
        // strategy from composition instead.
        return $this->getPopularDecks($commanderOracleId, $commanderName, null, $limit);
    }

    public function getPopularDecks(
        string $commanderOracleId,
        string $commanderName,
        ?string $strategyId,
        int $limit,
    ): array {
        if (!$this->enabled || $limit < 1) {
            return [];
        }

        try {
            $oracleUuid = Uuid::fromString($commanderOracleId);
        } catch (\InvalidArgumentException) {
            return [];
        }

        $commanderIdentity = null;
        $out = [];
        foreach ($this->decks->findContainingOracleId($oracleUuid, max($limit * 2, 20)) as $deck) {
            if (count($out) >= $limit) {
                break;
            }

            $commanderIdentity ??= $this->commanderIdentity($deck, $commanderOracleId);
            $payload = $this->normalize($deck, $commanderOracleId, $commanderIdentity ?? []);
            if (null !== $payload && $payload->looksLikeCommanderDeck()) {
                $out[] = $payload;
            }
        }

        return $out;
    }

    /**
     * @param list<string> $commanderIdentity
     */
    private function normalize(Deck $deck, string $commanderOracleId, array $commanderIdentity): ?ReferenceDeckPayload
    {
        $cards = [];
        $sawCommander = false;

        foreach ($deck->getCards() as $line) {
            $card = $line->getCard();
            if (!$card instanceof Card) {
                // Text-only lines cannot be resolved to an oracle identity, so
                // they would skew inclusion rates. Drop the whole deck rather
                // than aggregate a partial list.
                return null;
            }
            $oracle = strtolower((string) $card->getOracleId());
            if ($oracle === $commanderOracleId) {
                $sawCommander = true;
                continue;
            }
            if (!$this->colorIdentity->isSubsetOf($commanderIdentity, $card->getColorIdentity())) {
                return null;
            }
            $cards[$oracle] = ($cards[$oracle] ?? 0) + max(1, $line->getQuantity());
        }

        if (!$sawCommander || [] === $cards) {
            return null;
        }

        return new ReferenceDeckPayload(
            provider: self::NAME,
            externalId: (string) $deck->getId(),
            name: $deck->getName(),
            commanderOracleIds: [$commanderOracleId],
            cards: $cards,
            // First-party lists have no view counts. A low constant keeps them
            // in the pool without letting one user's deck outrank a list that
            // thousands of people have looked at.
            popularity: 0.25,
            updatedAt: $deck->getUpdatedAt(),
        );
    }

    /** @return list<string>|null */
    private function commanderIdentity(Deck $deck, string $commanderOracleId): ?array
    {
        foreach ($deck->getCards() as $line) {
            $card = $line->getCard();
            if ($card instanceof Card && strtolower((string) $card->getOracleId()) === $commanderOracleId) {
                return $card->getColorIdentity() ?? [];
            }
        }

        return null;
    }
}
