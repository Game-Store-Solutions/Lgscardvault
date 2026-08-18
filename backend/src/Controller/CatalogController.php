<?php

namespace App\Controller;

use App\Entity\Card;
use App\Repository\CardRepository;
use App\Repository\GameRepository;
use App\Repository\GameSetRepository;
use App\Repository\SealedProductRepository;
use App\Service\Catalog\GameCatalogSerializer;
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
     * Active games plus one piece of real card art each, for the landing page's
     * "games we support" tiles. Games whose catalog has not been synced yet come
     * back with a null imageUrl so the client can fall back to a text tile.
     */
    #[Route('/games/showcase', name: 'api_catalog_games_showcase', methods: ['GET'])]
    public function gamesShowcase(): JsonResponse
    {
        $showcase = [];
        foreach ($this->games->findActive() as $game) {
            $card = $this->cards->findShowcaseForGame($game);
            $showcase[] = [
                'code' => $game->getCode(),
                'name' => $game->getName(),
                // Ordered candidates, best first. TCGCSV art is stored as CDN
                // rendition URLs and an individual rendition can 404, so the
                // client walks this list instead of showing a broken image.
                'imageUrls' => null !== $card ? $this->imageCandidates($card, ['normal', 'large', 'small']) : [],
            ];
        }

        return $this->json($showcase);
    }

    /**
     * Card art for the marketing background, rotating once per day.
     *
     * The order is seeded by the current date rather than randomised per
     * request: the hero art stays put while someone browses (and stays
     * cacheable) but looks different tomorrow. `perGame` controls how many cards
     * each active game contributes, so the field stays balanced across games.
     */
    #[Route('/showcase-cards', name: 'api_catalog_showcase_cards', methods: ['GET'])]
    public function showcaseCards(Request $request): JsonResponse
    {
        $perGame = max(1, min(20, $request->query->getInt('perGame', 8)));
        $limit = max(1, min(80, $request->query->getInt('limit', 60)));
        $seed = (new \DateTimeImmutable('today'))->format('Y-m-d');

        // Pick per game first so every game is represented, then round-robin the
        // lists together — a flat shuffle lets the biggest catalog dominate and
        // clusters the same game in neighbouring positions.
        $byGame = [];
        foreach ($this->games->findActive() as $game) {
            $candidates = array_values(array_filter(
                $this->cards->findShowcaseCandidatesForGame($game, self::SHOWCASE_POOL_PER_GAME),
                static fn (Card $card): bool => null !== $card->getImageUrl(),
            ));

            // Deterministic daily shuffle: hashing (day + card id) gives a stable
            // order for the whole day without touching global RNG state.
            usort($candidates, static fn (Card $a, Card $b): int => strcmp(
                md5($seed.$a->getId()->toRfc4122()),
                md5($seed.$b->getId()->toRfc4122()),
            ));

            if ([] !== $candidates) {
                $byGame[] = array_slice($candidates, 0, $perGame);
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

        // These render a few percent of viewport wide, so ship the small
        // variant: the full-size art would be megabytes of hero background.
        $payload = array_map(fn (Card $card): array => [
            'id' => $card->getId()->toRfc4122(),
            'name' => $card->getName(),
            'gameCode' => $card->resolvedGameCode(),
            'imageUrl' => $this->preferredImage($card, ['small', 'normal', 'large']),
        ], array_slice($ordered, 0, $limit));

        $response = $this->json($payload);
        // Safe to cache: the payload only changes when the date does.
        $response->setPublic();
        $response->setMaxAge(3600);

        return $response;
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
