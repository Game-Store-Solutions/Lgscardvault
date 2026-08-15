<?php

namespace App\Service\Recovery;

use App\Entity\Card;
use App\Repository\CardRepository;
use App\Service\Catalog\CatalogCardResolver;
use App\Service\Catalog\PaperPrinting;
use App\Service\Scryfall\ScryfallClient;

/**
 * Finds the printing behind a failed CSV row.
 *
 * This is deliberately NOT the shared catalog search. Interactive search
 * (admin search, sell/trade, want lists, inventory variants) answers "what
 * matches what I typed" and must stay predictable. Recovery answers a
 * different question — "which real printing did this broken spreadsheet row
 * mean" — and to do that it walks a ladder, dropping the row's own filters
 * one rung at a time and finally asking Scryfall to guess at a misspelled
 * name. Running that behaviour on the shared endpoint would make every other
 * screen return cards nobody asked for, so it lives here instead.
 *
 * Nothing in this class mutates shared state; it only reads the catalog and
 * upserts printings Scryfall hands back, exactly as the shared search does.
 */
final class RecoveryCardFinder
{
    private const LOCAL_NAME_LIMIT = 60;
    private const REMOTE_LIMIT = 40;

    /** Local hits above this make a remote round-trip pointless. */
    private const REMOTE_SKIP_THRESHOLD = 15;

    /** Relaxation tokens the UI turns into copy. */
    public const RELAXED_ALCHEMY_NAME = 'alchemyName';
    public const RELAXED_COLLECTOR = 'collectorNumber';
    public const RELAXED_RARITY = 'rarity';
    public const RELAXED_SET = 'set';
    public const RELAXED_FUZZY = 'fuzzyName';

    /** @var array<string, RecoveryResult> */
    private array $memo = [];

    public function __construct(
        private readonly CardRepository $cardRepository,
        private readonly ScryfallClient $scryfallClient,
        private readonly CatalogCardResolver $catalogCardResolver,
    ) {
    }

    public function find(RecoveryQuery $query): RecoveryResult
    {
        return $this->memo[$query->cacheKey()] ??= $this->walkLadder($query);
    }

    private function walkLadder(RecoveryQuery $original): RecoveryResult
    {
        [$query, $relaxed] = $this->normalize($original);

        if ('' === trim($query->name) && '' === $query->collectorNumber) {
            return new RecoveryResult();
        }

        /** @var array<string, array{card: Card, reason: string}> $rejected */
        $rejected = [];

        // Rung 1: the row exactly as written.
        [$items, $rejected] = $this->gather($query, $rejected);
        if ([] !== $items) {
            return new RecoveryResult($items, array_values($rejected), $relaxed);
        }

        // Rung 2: collector numbers and rarity are the fields CSVs get wrong
        // most often, and a wrong one hides an otherwise perfect match.
        if ('' !== $query->collectorNumber || '' !== $query->rarity) {
            if ('' !== $query->collectorNumber) {
                $relaxed[] = self::RELAXED_COLLECTOR;
            }
            if ('' !== $query->rarity) {
                $relaxed[] = self::RELAXED_RARITY;
            }

            $query = $query->withoutCollectorAndRarity();
            [$items, $rejected] = $this->gather($query, $rejected);
            if ([] !== $items) {
                return new RecoveryResult($items, array_values($rejected), $relaxed);
            }
        }

        // Rung 3: an unknown set code makes every remote leg return nothing,
        // so the set is the last structural filter to go.
        if ('' !== $query->setCode) {
            $relaxed[] = self::RELAXED_SET;
            $query = $query->withoutSet();
            [$items, $rejected] = $this->gather($query, $rejected);
            if ([] !== $items) {
                return new RecoveryResult($items, array_values($rejected), $relaxed);
            }
        }

        // Rung 4: everything structural is gone, so the name itself is the
        // suspect. Scryfall's fuzzy matcher handles the typos that a
        // substring search never will.
        if ($query->isMagic()) {
            $fuzzy = $this->fuzzy($original->name, $original->setCode);
            if ($fuzzy instanceof Card) {
                $relaxed[] = self::RELAXED_FUZZY;
                [$items, $rejected] = $this->partition([$fuzzy], $original->game->getCode(), $rejected);
                if ([] !== $items) {
                    return new RecoveryResult($items, array_values($rejected), $relaxed);
                }
            }
        }

        return new RecoveryResult([], array_values($rejected), $relaxed);
    }

    /**
     * Alchemy rows arrive as "A-Guide of Souls" with collector "A-29". Both
     * only exist digitally, so searching them literally can only ever return
     * a card the store is forbidden to stock.
     *
     * @return array{RecoveryQuery, list<string>}
     */
    private function normalize(RecoveryQuery $query): array
    {
        if (!$query->isMagic()) {
            return [$query, []];
        }

        $relaxed = [];
        $name = trim($query->name);
        $collector = $query->collectorNumber;

        if (1 === preg_match('/^a-(?=\S)/i', $name)) {
            $name = substr($name, 2);
            $relaxed[] = self::RELAXED_ALCHEMY_NAME;
        }

        if (1 === preg_match('/^a[-.]/i', $collector)) {
            $collector = '';
            $relaxed[] = self::RELAXED_COLLECTOR;
        }

        return [
            new RecoveryQuery($query->game, $name, $query->setCode, $collector, $query->rarity, $query->finish),
            $relaxed,
        ];
    }

    /**
     * One rung: collect every candidate this filter set can reach, then split
     * it into stockable printings and rejected online-only ones.
     *
     * @param array<string, array{card: Card, reason: string}> $rejected
     *
     * @return array{list<Card>, array<string, array{card: Card, reason: string}>}
     */
    private function gather(RecoveryQuery $query, array $rejected): array
    {
        /** @var array<string, Card> $merged */
        $merged = [];

        // Outside Magic the catalog is purely local (TCGCSV) and Scryfall
        // knows nothing about it, so the local search IS the search.
        if (!$query->isMagic()) {
            foreach ($this->cardRepository->searchByNameForGame($query->game, $query->name, self::LOCAL_NAME_LIMIT) as $card) {
                if ($this->matches($query, $card)) {
                    $merged[(string) $card->getId()] = $card;
                }
            }

            return $this->partition(array_values($merged), $query->game->getCode(), $rejected);
        }

        // Natural key first: set + collector uniquely pins a printing, so it
        // beats any name match when the sheet supplies both.
        if ('' !== $query->setCode && '' !== $query->collectorNumber) {
            $exact = $this->cardRepository->findByNaturalKey($query->setCode, $query->collectorNumber);
            if ([] === $exact) {
                try {
                    $exact = array_values($this->scryfallClient->fetchCollectionBySetCollectors([
                        ['set' => $query->setCode, 'collectorNumber' => $query->collectorNumber],
                    ]));
                } catch (\Throwable) {
                    $exact = [];
                }
            }
            foreach ($exact as $card) {
                $merged[(string) $card->getId()] = $card;
            }
        }

        if ('' !== trim($query->name)) {
            foreach ($this->cardRepository->searchByName($query->name, self::LOCAL_NAME_LIMIT) as $card) {
                if ($this->matches($query, $card)) {
                    $merged[(string) $card->getId()] = $card;
                }
            }

            if (count($merged) < self::REMOTE_SKIP_THRESHOLD) {
                foreach ($this->remote($query) as $card) {
                    if ($this->matches($query, $card)) {
                        $merged[(string) $card->getId()] = $card;
                    }
                }
            }
        }

        // Last resort within the rung: the full resolver cascade, which adds
        // MTGJSON and tolerant name matching on top of what we just tried.
        if ([] === $merged && '' !== $query->setCode && '' !== trim($query->name)) {
            try {
                $resolution = $this->catalogCardResolver->resolve(
                    $query->name,
                    $query->setCode,
                    $query->collectorNumber,
                    $query->rarity,
                    $query->finish,
                );
                if ($resolution->card instanceof Card) {
                    $merged[(string) $resolution->card->getId()] = $resolution->card;
                }
            } catch (\Throwable) {
                // Best effort; an empty rung just falls through to the next.
            }
        }

        return $this->partition(array_values($merged), $query->game->getCode(), $rejected);
    }

    /**
     * Splits candidates into what the store may stock and what it may not,
     * dropping anything from another game (remote upserts join the merge, so
     * this stays belt-and-braces).
     *
     * @param list<Card>                                       $candidates
     * @param array<string, array{card: Card, reason: string}> $rejected
     *
     * @return array{list<Card>, array<string, array{card: Card, reason: string}>}
     */
    private function partition(array $candidates, string $gameCode, array $rejected): array
    {
        $items = [];

        foreach ($candidates as $card) {
            if ($card->resolvedGameCode() !== $gameCode) {
                continue;
            }

            $reason = PaperPrinting::onlineOnlyReason($card);
            if (null !== $reason) {
                $rejected[(string) $card->getId()] ??= ['card' => $card, 'reason' => $reason];
                continue;
            }

            $items[] = $card;
        }

        return [$items, $rejected];
    }

    private function matches(RecoveryQuery $query, Card $card): bool
    {
        return $this->catalogCardResolver->matchesFilters(
            $card,
            $query->setCode,
            $query->collectorNumber,
            $query->rarity,
            $query->finish,
        );
    }

    /** @return list<Card> */
    private function remote(RecoveryQuery $query): array
    {
        try {
            return $this->scryfallClient->searchRemoteAndUpsert(
                $query->name,
                self::REMOTE_LIMIT,
                '' !== $query->setCode ? $query->setCode : null,
                '' !== $query->finish ? $query->finish : null,
            );
        } catch (\Throwable) {
            // A Scryfall outage degrades recovery to local results rather
            // than failing the operator's whole search.
            return [];
        }
    }

    private function fuzzy(string $name, string $setCode): ?Card
    {
        try {
            return $this->scryfallClient->fetchByFuzzyName($name, '' !== $setCode ? $setCode : null)
                ?? $this->scryfallClient->fetchByFuzzyName($name);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Every paper printing of a matched card, newest first — the one-click
     * path from "close, but the wrong printing" to the right one.
     *
     * @return list<Card>
     */
    public function paperPrintingsOf(Card $card): array
    {
        $siblings = [];
        foreach ($this->cardRepository->findPrintingsByOracleId($card->getOracleId()) as $printing) {
            if ((string) $printing->getId() === (string) $card->getId()) {
                continue;
            }
            if (PaperPrinting::isPaper($printing)) {
                $siblings[] = $printing;
            }
        }

        return $siblings;
    }
}
