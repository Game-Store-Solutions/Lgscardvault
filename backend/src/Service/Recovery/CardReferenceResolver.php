<?php

namespace App\Service\Recovery;

use App\Entity\Card;
use App\Repository\CardRepository;
use App\Service\Scryfall\ScryfallClient;
use Symfony\Component\Uid\Uuid;

/**
 * Turns something the operator pasted into one exact printing.
 *
 * The guaranteed escape hatch for recovery: when no amount of searching finds
 * the card, they can open Scryfall, copy the URL, and paste it. Accepts a
 * Scryfall card URL, a bare card UUID, or a "set/collector" pair.
 *
 * Input is matched against a strict allow-list rather than being handed to an
 * HTTP client, so this can never be used to make the server fetch an
 * arbitrary URL.
 */
final readonly class CardReferenceResolver
{
    private const UUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';
    // Star suffixes (\x{2605}) are real collector numbers on some promos.
    private const SET_COLLECTOR_PATTERN = '#^([a-z0-9]{3,6})[/ ]([a-z0-9\-\x{2605}]{1,15})$#iu';
    private const SCRYFALL_URL_PATTERN = '#^https?://(?:www\.)?scryfall\.com/card/([a-z0-9]{3,6})/([a-z0-9\-]{1,15})#i';

    public function __construct(
        private CardRepository $cardRepository,
        private ScryfallClient $scryfallClient,
    ) {
    }

    /**
     * The printing named by $reference, or null when the input is not a
     * recognisable reference or names nothing we can find.
     */
    public function resolve(string $reference): ?Card
    {
        $reference = trim($reference);
        if ('' === $reference) {
            return null;
        }

        // A Scryfall URL sometimes carries the card id as ?id=, but the
        // /card/{set}/{collector} form is what the address bar shows.
        if (1 === preg_match(self::SCRYFALL_URL_PATTERN, $reference, $matches)) {
            return $this->byNaturalKey($matches[1], $matches[2]);
        }

        if (1 === preg_match(self::UUID_PATTERN, $reference)) {
            return $this->byId($reference);
        }

        if (1 === preg_match(self::SET_COLLECTOR_PATTERN, $reference, $matches)) {
            return $this->byNaturalKey($matches[1], $matches[2]);
        }

        return null;
    }

    private function byId(string $rawId): ?Card
    {
        try {
            $id = Uuid::fromString($rawId);
        } catch (\InvalidArgumentException) {
            return null;
        }

        $local = $this->cardRepository->find($id);
        if ($local instanceof Card) {
            return $local;
        }

        try {
            return $this->scryfallClient->fetchCardById($id);
        } catch (\Throwable) {
            return null;
        }
    }

    private function byNaturalKey(string $setCode, string $collectorNumber): ?Card
    {
        $local = $this->cardRepository->findByNaturalKey($setCode, $collectorNumber, 1);
        if ([] !== $local) {
            return $local[0];
        }

        try {
            $remote = $this->scryfallClient->fetchCollectionBySetCollectors([
                ['set' => $setCode, 'collectorNumber' => $collectorNumber],
            ]);
        } catch (\Throwable) {
            return null;
        }

        return array_values($remote)[0] ?? null;
    }
}
