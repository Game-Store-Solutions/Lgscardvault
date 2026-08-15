<?php

namespace App\Service\Recovery;

use App\Entity\Card;
use App\Repository\CardRepository;
use App\Service\Catalog\StockablePrintingPolicy;
use App\Service\Scryfall\ScryfallClient;
use Symfony\Component\Uid\Uuid;

/**
 * Turns something the operator pasted into one exact printing.
 *
 * Accepts a Scryfall card URL (including extra text around it), api.scryfall.com
 * links, a bare card UUID, or a "set/collector" pair. Input is matched against
 * a strict allow-list rather than being handed to an HTTP client, so this can
 * never be used to make the server fetch an arbitrary URL.
 */
final readonly class CardReferenceResolver
{
    private const UUID_BODY = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    // Collector must contain a digit (or a star) so two-word names like
    // "Snapping Gnarlid" are not parsed as set + collector.
    private const SET_COLLECTOR_PATTERN = '~^([a-z0-9]{2,10})[/ ]((?=[a-z0-9\\-\x{2605}]*[0-9\x{2605}])[a-z0-9\\-\x{2605}]{1,20})$~iu';
    private const PAGE_URL_PATTERN = '~https?://(?:www\.)?scryfall\.com/card/([a-z0-9]{2,10})/([^/?#\s]+)~i';
    private const API_SET_URL_PATTERN = '~https?://api\.scryfall\.com/cards/([a-z0-9]{2,10})/([^/?#\s]+)~i';
    private const API_ID_URL_PATTERN = '~https?://api\.scryfall\.com/cards/('.self::UUID_BODY.')~i';

    public function __construct(
        private CardRepository $cardRepository,
        private ScryfallClient $scryfallClient,
    ) {
    }

    public function resolve(string $reference): ?Card
    {
        $reference = trim($reference);
        if ('' === $reference) {
            return null;
        }

        // Prefer the card UUID when the URL carries one — that is the exact
        // printing the operator is looking at, including etched showcase rows
        // that share a set with a cheaper regular printing.
        if (1 === preg_match('/[?&]id=('.self::UUID_BODY.')/i', $reference, $matches)) {
            return $this->byId($matches[1]);
        }
        if (1 === preg_match(self::API_ID_URL_PATTERN, $reference, $matches)) {
            return $this->byId($matches[1]);
        }

        if (1 === preg_match(self::PAGE_URL_PATTERN, $reference, $matches)
            || 1 === preg_match(self::API_SET_URL_PATTERN, $reference, $matches)
        ) {
            return $this->byNaturalKey($matches[1], $this->decodeCollector($matches[2]));
        }

        if (1 === preg_match('/^'.self::UUID_BODY.'$/i', $reference)) {
            return $this->byId($reference);
        }

        if (1 === preg_match(self::SET_COLLECTOR_PATTERN, $reference, $matches)) {
            return $this->byNaturalKey($matches[1], $matches[2]);
        }

        return null;
    }

    private function decodeCollector(string $collectorNumber): string
    {
        $collectorNumber = rawurldecode($collectorNumber);
        // Path slug after the collector ("532/dynaheir-invoker-adept") is
        // already split off; this only unwraps %2F-less encodings.

        return $collectorNumber;
    }

    private function byId(string $rawId): ?Card
    {
        try {
            $id = Uuid::fromString($rawId);
        } catch (\InvalidArgumentException) {
            return null;
        }

        $local = $this->cardRepository->find($id);
        if ($local instanceof Card && $this->hasStoredPrice($local)) {
            return $local;
        }

        try {
            return $this->scryfallClient->fetchCardById($id) ?? $local;
        } catch (\Throwable) {
            return $local;
        }
    }

    private function byNaturalKey(string $setCode, string $collectorNumber): ?Card
    {
        $local = $this->cardRepository->findByNaturalKey($setCode, $collectorNumber, 1);
        $hit = $local[0] ?? null;
        if ($hit instanceof Card && $this->hasStoredPrice($hit)) {
            return $hit;
        }

        try {
            $remote = $this->scryfallClient->fetchCollectionBySetCollectors([
                ['set' => $setCode, 'collectorNumber' => $collectorNumber],
            ]);
        } catch (\Throwable) {
            return $hit;
        }

        return array_values($remote)[0] ?? $hit;
    }

    private function hasStoredPrice(Card $card): bool
    {
        return null !== StockablePrintingPolicy::storedPriceCents($card, false)
            || null !== StockablePrintingPolicy::storedPriceCents($card, true);
    }
}
