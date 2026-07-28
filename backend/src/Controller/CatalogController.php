<?php

namespace App\Controller;

use App\Repository\GameRepository;
use App\Repository\GameSetRepository;
use App\Repository\SealedProductRepository;
use App\Service\Catalog\GameCatalogSerializer;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
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
        private readonly GameCatalogSerializer $serializer,
    ) {
    }

    #[Route('/games', name: 'api_catalog_games', methods: ['GET'])]
    public function games(): JsonResponse
    {
        return $this->json(array_map($this->serializer->game(...), $this->games->findActive()));
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
