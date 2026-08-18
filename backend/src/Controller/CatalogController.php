<?php

namespace App\Controller;

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
            $showcase[] = [
                'code' => $game->getCode(),
                'name' => $game->getName(),
                'imageUrl' => $this->cards->findShowcaseForGame($game)?->getImageUrl(),
            ];
        }

        return $this->json($showcase);
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
