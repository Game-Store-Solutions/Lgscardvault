<?php

namespace App\Service\Catalog;

use App\DTO\CatalogResolutionResult;
use App\Entity\Card;
use App\Repository\CardRepository;
use App\Service\MTGJson\MTGJsonClient;
use App\Service\Scryfall\ScryfallClient;
use Symfony\Component\Uid\Uuid;

final readonly class CatalogCardResolver
{
    public function __construct(
        private CardRepository $cardRepository,
        private MTGJsonClient $mtgJsonClient,
        private ScryfallClient $scryfallClient,
    ) {
    }

    public function resolve(
        string $name,
        string $setCode,
        string $collectorNumber,
        string $rarity,
        string $finish,
    ): CatalogResolutionResult {
        $setCode = $this->normalizeSetCode($setCode);
        $localCard = $this->matchLocal($name, $setCode, $collectorNumber, $rarity, $finish);
        if ($localCard instanceof Card) {
            return new CatalogResolutionResult($localCard);
        }

        $fallbackCard = $this->resolveViaScryfallSearch($name, $setCode, $collectorNumber, $rarity, $finish);
        if ($fallbackCard instanceof Card) {
            return new CatalogResolutionResult($fallbackCard);
        }

        try {
            $mtgJsonCard = $this->matchMtgJsonCard($name, $setCode, $collectorNumber, $rarity, $finish);
        } catch (\Throwable $e) {
            return new CatalogResolutionResult(null, 'MTGJSON lookup failed and Scryfall fallback found no match: '.$e->getMessage());
        }

        if (null === $mtgJsonCard) {
            return new CatalogResolutionResult(null, 'No matching MTGJSON or Scryfall printing found.');
        }

        return $this->resolveByMtgJsonScryfallId($mtgJsonCard);
    }

    public function resolveForPreview(
        string $name,
        string $setCode,
        string $collectorNumber,
        string $rarity,
        string $finish,
        bool $allowRemoteSearch,
    ): CatalogResolutionResult {
        $setCode = $this->normalizeSetCode($setCode);
        $localCard = $this->matchLocal($name, $setCode, $collectorNumber, $rarity, $finish);
        if ($localCard instanceof Card) {
            return new CatalogResolutionResult($localCard);
        }

        if (!$allowRemoteSearch) {
            return new CatalogResolutionResult(null, 'Not previewed yet. Resolve this row individually or retry after finalizing the current matches.');
        }

        $fallbackCard = $this->resolveViaScryfallSearch($name, $setCode, $collectorNumber, $rarity, $finish);
        if ($fallbackCard instanceof Card) {
            return new CatalogResolutionResult($fallbackCard);
        }

        return new CatalogResolutionResult(null, 'No matching local or Scryfall printing found.');
    }

    /**
     * Resolve a matched MTGJSON card to a local/Scryfall Card via its Scryfall id.
     *
     * @param array<string, mixed> $mtgJsonCard
     */
    private function resolveByMtgJsonScryfallId(array $mtgJsonCard): CatalogResolutionResult
    {
        $scryfallId = $mtgJsonCard['identifiers']['scryfallId'] ?? null;
        if (!is_string($scryfallId) || '' === $scryfallId) {
            return new CatalogResolutionResult(null, 'Matched MTGJSON card does not include a Scryfall ID.');
        }

        try {
            $id = Uuid::fromString($scryfallId);
        } catch (\InvalidArgumentException) {
            return new CatalogResolutionResult(null, 'Matched card has an invalid Scryfall ID.');
        }

        try {
            $card = $this->cardRepository->find($id) ?? $this->scryfallClient->fetchCardById($id);
        } catch (\Throwable $e) {
            return new CatalogResolutionResult(null, 'Scryfall lookup failed: '.$e->getMessage());
        }

        if (!$card instanceof Card) {
            return new CatalogResolutionResult(null, 'Could not fetch matched Scryfall card.');
        }

        return new CatalogResolutionResult($card);
    }

    /**
     * CSV exports often carry the full set NAME ("Adventures in the Forgotten
     * Realms", "Aetherdrift Commander") where we expect the set CODE ("afr",
     * "drc") — and every matcher compares codes, so such rows fail across the
     * board. Resolve names to codes via the local catalog: a value that isn't
     * a known code but matches a known set name (exactly, case-insensitively)
     * becomes that set's code. Unresolvable values pass through unchanged so
     * remote lookups can still try them.
     */
    public function normalizeSetCode(string $set): string
    {
        $trimmed = trim($set);
        if ('' === $trimmed) {
            return '';
        }

        // Set codes are short and single-token; anything else is name-shaped.
        $looksLikeCode = strlen($trimmed) <= 6 && !str_contains($trimmed, ' ');
        if ($looksLikeCode && $this->cardRepository->setCodeExists($trimmed)) {
            return $trimmed;
        }

        $resolved = $this->cardRepository->findSetCodeByName($trimmed);
        if (null !== $resolved) {
            return $resolved;
        }

        return $trimmed;
    }

    public function serializeCard(Card $card): array
    {
        return [
            'id' => (string) $card->getId(),
            'oracleId' => (string) $card->getOracleId(),
            'game' => $card->resolvedGameCode(),
            // The frontend's CardSummary reads gameCode (matching the entity
            // serializer); without it every catalog result read as Magic —
            // wrong finish vocabulary, wrong defaults, wrong labels.
            'gameCode' => $card->resolvedGameCode(),
            'name' => $card->getName(),
            'setCode' => $card->getSetCode(),
            'setName' => $card->getSetName(),
            'collectorNumber' => $card->getCollectorNumber(),
            'rarity' => $card->getRarity(),
            'manaCost' => $card->getManaCost(),
            'typeLine' => $card->getTypeLine(),
            'oracleText' => $card->getOracleText(),
            'cmc' => $card->getCmc(),
            'imageUrl' => $card->getImageUrl(),
            'imageUris' => $card->getImageUris(),
            'cardFaces' => $card->getCardFaces(),
            'prices' => $card->getPrices(),
            'colors' => $card->getColors(),
            'colorIdentity' => $card->getColorIdentity(),
            'keywords' => $card->getKeywords(),
            'power' => $card->getPower(),
            'toughness' => $card->getToughness(),
            'loyalty' => $card->getLoyalty(),
            'artist' => $card->getArtist(),
            'flavorText' => $card->getFlavorText(),
            'legalities' => $card->getLegalities(),
            'finishes' => $card->getFinishes(),
            'games' => $card->getGames(),
            'releasedAt' => $card->getReleasedAt()?->format('Y-m-d'),
            'lang' => $card->getLang(),
            'layout' => $card->getLayout(),
            'scryfallUri' => $card->getScryfallUri(),
        ];
    }

    /**
     * Shared catalog filter predicate. Both the search controller and the
     * resolver use this so the matching rules stay in one place. Filter values
     * are compared case-insensitively, so callers may pass them raw or lowercased.
     */
    public function matchesFilters(
        Card $card,
        string $setCode,
        string $collectorNumber,
        string $rarity,
        string $finish,
    ): bool {
        if ('' !== $setCode && strtolower($card->getSetCode()) !== strtolower($setCode)) {
            return false;
        }

        if ('' !== $collectorNumber && strtolower($card->getCollectorNumber()) !== strtolower($collectorNumber)) {
            return false;
        }

        if ('' !== $rarity && $this->normalizeRarity((string) $card->getRarity()) !== $this->normalizeRarity($rarity)) {
            return false;
        }

        // Outside Magic the treatment is called "Holofoil" or "Rainbow Foil",
        // never the literal "foil" the filter sends, so compare the axis
        // rather than the word.
        if ('' !== $finish && !FinishVocabulary::offers($finish, $card->getFinishes())) {
            return false;
        }

        return true;
    }

    /** @return array<string, mixed>|null */
    private function matchMtgJsonCard(
        string $name,
        string $setCode,
        string $collectorNumber,
        string $rarity,
        string $finish,
    ): ?array {
        $cards = $this->mtgJsonClient->getSetCards($setCode);
        $normalizedName = $this->normalizeMatchValue($name);
        $normalizedCollectorNumber = $this->normalizeMatchValue($collectorNumber);
        $normalizedRarity = $this->normalizeRarity($rarity);

        foreach ($cards as $card) {
            $cardName = $this->normalizeMatchValue((string) ($card['name'] ?? ''));
            $cardNumber = $this->normalizeMatchValue((string) ($card['number'] ?? ''));
            $cardRarity = $this->normalizeRarity((string) ($card['rarity'] ?? ''));
            $cardFinishes = isset($card['finishes']) && is_array($card['finishes']) ? $card['finishes'] : [];

            if ($cardName !== $normalizedName) {
                continue;
            }
            if ('' !== $normalizedCollectorNumber && $cardNumber !== $normalizedCollectorNumber) {
                continue;
            }
            if ('' !== $normalizedRarity && $cardRarity !== $normalizedRarity) {
                continue;
            }
            if ([] !== $cardFinishes && !in_array($finish, $cardFinishes, true)) {
                continue;
            }

            return $card;
        }

        return null;
    }

    private function normalizeMatchValue(string $value): string
    {
        return (string) preg_replace('~\s+~', ' ', strtolower(trim($value)));
    }

    private function normalizeRarity(string $value): string
    {
        $normalized = $this->normalizeMatchValue($value);

        return match ($normalized) {
            'mythic rare' => 'mythic',
            default => $normalized,
        };
    }

    private function resolveViaScryfallSearch(
        string $name,
        string $setCode,
        string $collectorNumber,
        string $rarity,
        string $finish,
    ): ?Card {
        try {
            $cards = $this->scryfallClient->searchRemoteAndUpsert($name, 10, $setCode, $finish);
        } catch (\Throwable) {
            return null;
        }

        foreach ($cards as $card) {
            if ($this->isAcceptableMatch($card, $name, $setCode, $collectorNumber, $rarity, $finish)) {
                return $card;
            }
        }

        return null;
    }

    /**
     * Local catalog match for a printing.
     *
     * Primary path: the natural key (set code + collector number) via an
     * indexed exact lookup — every import row carries both, and unlike the
     * old name-substring scan this stays O(log n) as the catalog grows and
     * cannot miss printings that fall outside a name-search result limit
     * (e.g. the hundreds of "Forest" printings). Name search remains as a
     * fallback for rows without a collector number.
     */
    public function matchLocal(
        string $name,
        string $setCode,
        string $collectorNumber,
        string $rarity,
        string $finish,
    ): ?Card {
        if ('' !== trim($setCode) && '' !== trim($collectorNumber)) {
            foreach ($this->cardRepository->findByNaturalKey($setCode, $collectorNumber) as $card) {
                if ($this->isAcceptableMatch($card, $name, $setCode, $collectorNumber, $rarity, $finish)) {
                    return $card;
                }
            }
        }

        foreach ($this->cardRepository->searchByName($name, 20) as $card) {
            if ($this->isAcceptableMatch($card, $name, $setCode, $collectorNumber, $rarity, $finish)) {
                return $card;
            }
        }

        return null;
    }

    /**
     * Full acceptance check for a candidate card against an import row:
     * the structural filters (set / collector number / rarity / finish)
     * plus the name comparison. Shared by the local matcher, the Scryfall
     * search fallback, and the CSV batch pre-resolution.
     */
    public function isAcceptableMatch(
        Card $card,
        string $name,
        string $setCode,
        string $collectorNumber,
        string $rarity,
        string $finish,
    ): bool {
        return $this->matchesFilters(
            $card,
            strtolower($setCode),
            strtolower($collectorNumber),
            strtolower($rarity),
            $finish,
        ) && $this->nameMatches($card, $name);
    }

    /**
     * Name comparison tolerant of multi-face formatting: vendors export
     * split/transform cards as "Fire // Ice", "Fire//Ice", or just the
     * front face "Fire". All should match the catalog's "Fire // Ice".
     */
    private function nameMatches(Card $card, string $name): bool
    {
        $cardName = $this->normalizeMatchValue($card->getName());
        $rowName = $this->normalizeMatchValue($name);
        if ($cardName === $rowName) {
            return true;
        }

        $canonicalCard = (string) preg_replace('~\s*//\s*~', ' // ', $cardName);
        $canonicalRow = (string) preg_replace('~\s*//\s*~', ' // ', $rowName);
        if ($canonicalCard === $canonicalRow) {
            return true;
        }

        // Front-face-only row names ("Fire" for "Fire // Ice").
        return explode(' // ', $canonicalCard)[0] === $canonicalRow;
    }
}
