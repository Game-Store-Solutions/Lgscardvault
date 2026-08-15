<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Security\ApiRateLimit;
use App\Service\Catalog\CatalogCardResolver;
use App\Service\Catalog\PaperPrinting;
use App\Service\Scryfall\ScryfallClient;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/catalog')]
class CardSearchController extends AbstractController
{
    /**
     * When a filtered local search returns at least this many cards, the
     * result set is considered good enough to skip the Scryfall fallback.
     */
    private const REMOTE_FALLBACK_THRESHOLD = 15;

    /**
     * Hard cap on resolve-batch rows per request. Each unresolvable row can
     * cost remote lookups against the host-global Scryfall budget, so an
     * unbounded array from any authenticated user was a platform-wide DoS
     * vector (50k bogus rows ≈ hours of monopolised rate-limiter time).
     */
    private const MAX_RESOLVE_BATCH_ROWS = 100;

    public function __construct(
        private readonly CardRepository $cardRepository,
        private readonly \App\Repository\GameRepository $gameRepository,
        private readonly ScryfallClient $scryfallClient,
        private readonly CatalogCardResolver $catalogCardResolver,
        #[Autowire(service: 'limiter.catalog_search')]
        private readonly RateLimiterFactoryInterface $catalogSearchLimiter,
    ) {
    }

    #[Route('/search', name: 'api_catalog_search', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function search(Request $request): JsonResponse
    {
        if (null !== $response = ApiRateLimit::enforce($this->catalogSearchLimiter, $this->rateLimitKey($request))) {
            return $response;
        }

        $query = trim((string) $request->query->get('q', ''));
        if ('' === $query) {
            return $this->json([]);
        }

        // CSVs (and humans) often supply a full set NAME ("Modern Horizons 2")
        // instead of the code ("mh2"). Every downstream leg — the local filter,
        // the natural-key lookup, and Scryfall's collection/search endpoints —
        // only understands codes, so an unnormalized name silently zeroes out
        // the whole search. Same normalization the CSV recovery preview uses.
        $setCode = strtolower($this->catalogCardResolver->normalizeSetCode(
            (string) $request->query->get('set', ''),
        ));
        $collectorNumber = strtolower(trim((string) $request->query->get('collectorNumber', '')));
        $rarity = strtolower(trim((string) $request->query->get('rarity', '')));
        $finish = strtolower(trim((string) $request->query->get('finish', '')));
        if (!in_array($finish, ['foil', 'nonfoil'], true)) {
            $finish = '';
        }

        // Game scoping. Every game except Magic has a purely local catalog
        // (TCGCSV), and Scryfall knows nothing about them — so for those the
        // local search below IS the search, and the remote legs are skipped
        // rather than run and discarded.
        //
        // No game param means MAGIC, not "everything": every caller that
        // omits it (mass search, buy list, decks, CSV recovery) is a Magic
        // surface, and an unscoped search is how a One Piece card ends up
        // added from a Magic screen.
        $gameCode = trim((string) $request->query->get('game', ''));
        $game = $this->gameRepository->findOneByCode('' !== $gameCode ? $gameCode : Game::CODE_MTG);
        if (null === $game) {
            return $this->json(['detail' => 'Unknown game.'], 404);
        }

        if (!$game->isMtg()) {
            // The same filters the Magic path honors. Skipping them here meant
            // a Pokemon workspace's set / rarity / finish pickers changed
            // nothing at all — the results came back untouched.
            $matches = array_filter(
                $this->cardRepository->searchByNameForGame($game, $query, 40),
                fn (Card $card): bool => $this->catalogCardResolver
                    ->matchesFilters($card, $setCode, $collectorNumber, $rarity, $finish),
            );

            return $this->json(array_map($this->catalogCardResolver->serializeCard(...), array_values($matches)));
        }

        /** @var array<string, \App\Entity\Card> $merged */
        $merged = [];

        // 1. Name-based local matches (honoring all filters).
        foreach ($this->cardRepository->searchByName($query, 60) as $card) {
            if ($this->catalogCardResolver->matchesFilters($card, $setCode, $collectorNumber, $rarity, $finish)) {
                $merged[(string) $card->getId()] = $card;
            }
        }

        // 2. Natural-key (set + collector number) resolution — the DEFINITIVE
        //    lookup. A printing is uniquely identified by set + collector, so
        //    this finds the exact card even when the query name is messy
        //    ("Sol Ring (Retro Frame)", typos, foreign text) and name search
        //    misses it. This is the same path the CSV failed-row recovery uses,
        //    which is why retry finds cards that plain search could not. The
        //    name query is intentionally NOT applied here, and rarity/finish are
        //    left to the caller to pick, since set + collector already pin the
        //    printing.
        if ('' !== $setCode && '' !== $collectorNumber) {
            $exact = $this->cardRepository->findByNaturalKey($setCode, $collectorNumber);
            if ([] === $exact) {
                try {
                    $exact = array_values($this->scryfallClient->fetchCollectionBySetCollectors([
                        ['set' => $setCode, 'collectorNumber' => $collectorNumber],
                    ]));
                } catch (\Throwable) {
                    $exact = [];
                }
            }
            foreach ($exact as $card) {
                $merged[(string) $card->getId()] = $card;
            }
        }

        // 3. Remote name search fallback when local results are still thin.
        //    Wrapped so a Scryfall outage degrades to local-only results
        //    instead of failing the whole request with a 500.
        if (count($merged) < self::REMOTE_FALLBACK_THRESHOLD) {
            try {
                $remote = $this->scryfallClient->searchRemoteAndUpsert(
                    $query,
                    40,
                    '' !== $setCode ? $setCode : null,
                    '' !== $finish ? $finish : null,
                );
                foreach ($remote as $card) {
                    if ($this->catalogCardResolver->matchesFilters($card, $setCode, $collectorNumber, $rarity, $finish)) {
                        $merged[(string) $card->getId()] = $card;
                    }
                }
            } catch (\Throwable) {
                // Remote catalog is best-effort; local results already stand.
            }
        }

        // 4. Last resort for a zero-hit search with a set in hand: run the full
        //    CSV-recovery resolution cascade (tolerant local match → Scryfall
        //    search → MTGJSON), so the failed-row modal can find printings
        //    that plain name search can't (typos, promo variants, foreign
        //    names). Only on empty results — the cascade can cost remote
        //    lookups, and a populated result set doesn't need it.
        if ([] === $merged && '' !== $setCode) {
            try {
                $resolution = $this->catalogCardResolver->resolve($query, $setCode, $collectorNumber, $rarity, $finish);
                if ($resolution->card instanceof \App\Entity\Card) {
                    $merged[(string) $resolution->card->getId()] = $resolution->card;
                }
            } catch (\Throwable) {
                // Best-effort as well; an empty result is still a valid answer.
            }
        }

        // Belt and braces: the legacy helpers are Magic-scoped, but remote
        // upserts join the merge too — nothing non-Magic may leave this path.
        //
        // The paper filter is a platform rule, not a search preference: no
        // screen may stock an Alchemy/Arena printing, so none of them should
        // offer one. Failed-row recovery needs to go further than this (it
        // relaxes the row's own filters and explains digital hits instead of
        // hiding them), and that behaviour deliberately lives in
        // App\Service\Recovery so it can never reshape this endpoint.
        $results = array_values(array_filter(
            array_values($merged),
            static fn (\App\Entity\Card $card): bool => $card->resolvedGameCode() === $game->getCode()
                && PaperPrinting::isPaper($card),
        ));

        return $this->json(array_map(
            $this->catalogCardResolver->serializeCard(...),
            array_slice($results, 0, 40),
        ));
    }

    #[Route('/by-artist', name: 'api_catalog_by_artist', methods: ['GET'])]
    public function byArtist(Request $request): JsonResponse
    {
        if (null !== $response = ApiRateLimit::enforce($this->catalogSearchLimiter, $this->rateLimitKey($request))) {
            return $response;
        }

        $artist = trim((string) $request->query->get('artist', ''));
        if ('' === $artist) {
            return $this->json(['detail' => 'Artist name is required.'], 400);
        }

        $gameCode = trim((string) $request->query->get('game', Game::CODE_MTG));
        $game = $this->gameRepository->findOneByCode('' !== $gameCode ? $gameCode : Game::CODE_MTG);
        if (null === $game) {
            return $this->json(['detail' => 'Unknown game.'], 404);
        }

        $limit = min(120, max(1, $request->query->getInt('limit', 60)));
        $offset = max(0, $request->query->getInt('offset', 0));

        $cards = $this->cardRepository->findByArtistForGame($game, $artist, $limit, $offset);

        return $this->json([
            'artist' => $artist,
            'gameCode' => $game->getCode(),
            'total' => $this->cardRepository->countByArtistForGame($game, $artist),
            'offset' => $offset,
            'limit' => $limit,
            'items' => array_map($this->catalogCardResolver->serializeCard(...), $cards),
        ]);
    }

    /**
     * Rate-limit bucket key: the authenticated user id (the endpoint requires
     * ROLE_USER), falling back to client IP defensively.
     */
    private function rateLimitKey(Request $request): string
    {
        $user = $this->getUser();

        return null !== $user ? 'user:'.$user->getUserIdentifier() : 'ip:'.$request->getClientIp();
    }

    #[Route('/resolve-batch', name: 'api_catalog_resolve_batch', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function resolveBatch(Request $request): JsonResponse
    {
        /** @var array{rows?: list<array<string, mixed>>} $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $rows = is_array($payload['rows'] ?? null) ? $payload['rows'] : [];
        if (count($rows) > self::MAX_RESOLVE_BATCH_ROWS) {
            return $this->json([
                'detail' => sprintf('Too many rows: maximum %d per request.', self::MAX_RESOLVE_BATCH_ROWS),
            ], 400);
        }
        $results = [];

        foreach ($rows as $row) {
            $rowIndex = (int) ($row['rowIndex'] ?? count($results));
            $name = trim((string) ($row['name'] ?? ''));
            $setCode = trim((string) ($row['set'] ?? ''));
            $collectorNumber = trim((string) ($row['collectorNumber'] ?? ''));
            $rarity = trim((string) ($row['rarity'] ?? ''));
            $finish = ((bool) ($row['foil'] ?? false)) ? 'foil' : 'nonfoil';

            if ('' === $name || '' === $setCode) {
                $results[] = [
                    'rowIndex' => $rowIndex,
                    'error' => 'Name and set are required for MTGJSON matching.',
                ];
                continue;
            }

            $resolution = $this->catalogCardResolver->resolve($name, $setCode, $collectorNumber, $rarity, $finish);
            if ($resolution->isResolved() && $resolution->card instanceof \App\Entity\Card) {
                $results[] = [
                    'rowIndex' => $rowIndex,
                    'card' => $this->catalogCardResolver->serializeCard($resolution->card),
                ];
                continue;
            }
            $results[] = [
                'rowIndex' => $rowIndex,
                'error' => $resolution->error ?? 'No matching MTGJSON or Scryfall printing found.',
            ];
        }

        return $this->json(['results' => $results]);
    }
}
