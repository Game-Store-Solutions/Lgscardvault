<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Repository\GameRepository;
use App\Repository\GameSetRepository;
use App\Repository\SealedProductRepository;
use App\Service\Catalog\GameCatalogSerializer;
use App\Service\Catalog\ShowcaseCardCatalog;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use App\Entity\CsvImportJob;
use App\Service\CsvImport\ImportTemplateBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Public multi-game catalog reads: supported games, their sets, and the
 * sealed product catalog. Store-agnostic — store inventory endpoints live
 * under /api/stores/{slug}.
 */
#[Route('/api/catalog')]
final class CatalogController extends AbstractController
{
    /** Candidates pulled per game before the daily shuffle picks winners. */
    private const SHOWCASE_POOL_PER_GAME = 30;

    public function __construct(
        private readonly GameRepository $games,
        private readonly GameSetRepository $gameSets,
        private readonly SealedProductRepository $sealedProducts,
        private readonly CardRepository $cards,
        private readonly ShowcaseCardCatalog $showcaseCatalog,
        private readonly GameCatalogSerializer $serializer,
        private readonly ImportTemplateBuilder $templateBuilder,
    ) {
    }

    #[Route('/games', name: 'api_catalog_games', methods: ['GET'])]
    public function games(): JsonResponse
    {
        return $this->json(array_map($this->serializer->game(...), $this->games->findActive()));
    }

    /**
     * Active games plus real card art each, for the landing page's "games we
     * support" tiles. Art is the game's signature card (see
     * ShowcaseCardCatalog), falling back to the newest synced printing. Games
     * with no art at all come back with an empty list so the client can render a
     * text tile instead.
     */
    #[Route('/games/showcase', name: 'api_catalog_games_showcase', methods: ['GET'])]
    public function gamesShowcase(): JsonResponse
    {
        $showcase = [];
        foreach ($this->games->findActive() as $game) {
            $card = $this->showcaseCardsForGame($game, 1)[0] ?? null;
            $showcase[] = [
                'code' => $game->getCode(),
                'name' => $game->getName(),
                // Ordered candidates, best first. `small` leads deliberately:
                // tiles render ~250px wide, and TCGCSV's larger renditions are
                // derived URLs that the CDN does not always serve (Flesh and
                // Blood has no in_1000x1000). The client walks the list, so a
                // missing rendition costs nothing.
                'imageUrls' => null !== $card ? $this->imageCandidates($card, ['small', 'normal', 'large']) : [],
            ];
        }

        return $this->json($showcase);
    }

    /**
     * Card art for the marketing background — the signature cards of every game
     * we service, resolved from our own catalog (see ShowcaseCardCatalog).
     *
     * The selection is stable rather than randomised: the same recognizable
     * cards every visit, which keeps the page cacheable and means the hero never
     * changes under a returning visitor. `perGame` controls how many cards each
     * game contributes so the field stays balanced.
     */
    #[Route('/showcase-cards', name: 'api_catalog_showcase_cards', methods: ['GET'])]
    public function showcaseCards(Request $request): JsonResponse
    {
        $perGame = max(1, min(20, $request->query->getInt('perGame', 8)));
        $limit = max(1, min(80, $request->query->getInt('limit', 60)));

        // Pick per game first, then round-robin the lists together so games
        // interleave across the field instead of clustering.
        $byGame = [];
        foreach ($this->games->findActive() as $game) {
            $cards = $this->showcaseCardsForGame($game, $perGame);
            if ([] !== $cards) {
                $byGame[] = $cards;
            }
        }

        $ordered = [];
        for ($slot = 0; $slot < $perGame; ++$slot) {
            foreach ($byGame as $cards) {
                if (isset($cards[$slot])) {
                    $ordered[] = $cards[$slot];
                }
            }
        }

        // `imageUrl` stays the compact rendition for the hero scatter. `imageUrls`
        // is quality-first so the games reel can show large art and fall back if
        // a CDN size 404s (TCGCSV's in_1000x1000 is missing for some games).
        $payload = array_map(fn (Card $card): array => [
            'id' => $card->getId()->toRfc4122(),
            'name' => $card->getName(),
            'gameCode' => $card->resolvedGameCode(),
            'imageUrl' => $this->preferredImage($card, ['small', 'normal', 'large']),
            'imageUrls' => $this->imageCandidates($card, ['large', 'normal', 'small']),
        ], array_slice($ordered, 0, $limit));

        $response = $this->json($payload);
        // Safe to cache: the selection only changes when the catalog does.
        $response->setPublic();
        $response->setMaxAge(3600);

        return $response;
    }

    /**
     * The showcase cards for one game: curated signature cards first, topped up
     * with the newest synced art so a thin catalog still fills the layout.
     *
     * @return list<Card>
     */
    private function showcaseCardsForGame(Game $game, int $limit): array
    {
        $curated = $this->cards->findShowcaseByNamesForGame(
            $game,
            $this->showcaseCatalog->forGame((string) $game->getCode()),
        );

        if (count($curated) >= $limit) {
            return array_slice($curated, 0, $limit);
        }

        $chosen = [];
        foreach ($curated as $card) {
            $chosen[(string) $card->getId()] = $card;
        }

        foreach ($this->cards->findShowcaseCandidatesForGame($game, self::SHOWCASE_POOL_PER_GAME) as $card) {
            if (count($chosen) >= $limit) {
                break;
            }
            $chosen[(string) $card->getId()] ??= $card;
        }

        return array_slice(array_values($chosen), 0, $limit);
    }

    /**
     * Pick the smallest usable art variant for the job. Card::getImageUrl()
     * always prefers `large`, which is right for a product page and wasteful for
     * a thumbnail or a background tile.
     *
     * @param list<string> $preference image_uris keys, best first
     */
    private function preferredImage(Card $card, array $preference): ?string
    {
        return $this->imageCandidates($card, $preference)[0] ?? null;
    }

    /**
     * Every usable art URL for a card, best variant first and de-duplicated.
     *
     * @param list<string> $preference image_uris keys, best first
     *
     * @return list<string>
     */
    private function imageCandidates(Card $card, array $preference): array
    {
        $uris = $card->getImageUris() ?? [];
        $candidates = [];
        foreach ($preference as $key) {
            $candidate = $uris[$key] ?? null;
            if (is_string($candidate) && '' !== $candidate) {
                $candidates[] = $candidate;
            }
        }

        // Multi-faced cards keep art on the faces; getImageUrl() handles those.
        $fallback = $card->getImageUrl();
        if (null !== $fallback && '' !== $fallback) {
            $candidates[] = $fallback;
        }

        return array_values(array_unique($candidates));
    }

    #[Route('/games/{code}/sets', name: 'api_catalog_game_sets', methods: ['GET'])]
    public function sets(string $code): JsonResponse
    {
        $game = $this->games->findOneByCode($code);
        if (null === $game) {
            return $this->json(['detail' => 'Unknown game.'], 404);
        }

        return $this->json(array_map($this->serializer->gameSet(...), $this->gameSets->findForGame($game)));
    }

    /**
     * Downloadable sample sheet for a game, in the columns the importer
     * expects and with examples written in that game's own conventions
     * (Magic set codes vs "OP01-003"). ?type=sealed for a sealed template.
     */
    #[Route('/games/{code}/import-template', name: 'api_catalog_import_template', methods: ['GET'])]
    public function importTemplate(Request $request, string $code): Response
    {
        $game = $this->games->findOneByCode($code);
        if (null === $game) {
            return $this->json(['detail' => 'Unknown game.'], 404);
        }

        $type = CsvImportJob::TYPE_SEALED === $request->query->get('type')
            ? CsvImportJob::TYPE_SEALED
            : CsvImportJob::TYPE_CARDS;

        return new Response($this->templateBuilder->build($game, $type), 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => sprintf('attachment; filename="%s"', $this->templateBuilder->filename($game, $type)),
        ]);
    }

    #[Route('/sealed', name: 'api_catalog_sealed', methods: ['GET'])]
    public function sealed(Request $request): JsonResponse
    {
        $game = null;
        $gameCode = trim((string) $request->query->get('game', ''));
        if ('' !== $gameCode) {
            $game = $this->games->findOneByCode($gameCode);
            if (null === $game) {
                return $this->json(['detail' => 'Unknown game.'], 404);
            }
        }

        $setId = $request->query->getInt('setId');
        $page = max(1, $request->query->getInt('page', 1));
        $perPage = min(60, max(1, $request->query->getInt('perPage', 24)));

        $result = $this->sealedProducts->search(
            $game,
            $setId > 0 ? $setId : null,
            (string) $request->query->get('q', ''),
            $page,
            $perPage,
        );

        return $this->json([
            'items' => array_map($this->serializer->sealedProduct(...), $result['items']),
            'total' => $result['total'],
            'page' => $page,
            'perPage' => $perPage,
        ]);
    }
}
