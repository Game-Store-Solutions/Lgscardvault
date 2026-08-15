<?php

namespace App\Controller;

use App\Entity\Store;
use App\Repository\GameRepository;
use App\Repository\InventoryItemRepository;
use App\Repository\SealedInventoryItemRepository;
use App\Repository\StoreRepository;
use App\Service\Catalog\GameCatalogSerializer;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * A store's games: which ones it carries, and the headline numbers for one
 * of them. These drive the per-game workspace — the switcher is pure
 * navigation, and the numbers live on the page for the selected game
 * rather than being crammed onto the nav itself.
 */
#[Route('/api/stores/{slug}')]
final class StoreGameController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly GameRepository $games,
        private readonly InventoryItemRepository $singles,
        private readonly SealedInventoryItemRepository $sealed,
        private readonly GameCatalogSerializer $serializer,
    ) {
    }

    /**
     * Public: the games this store actually carries, in platform order, with
     * what it stocks of each. The storefront switcher is built from this —
     * offering a tab that leads to an empty shelf is worse than not
     * offering it.
     */
    #[Route('/games', name: 'api_store_games', methods: ['GET'])]
    public function games(string $slug): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $withSingles = $this->singles->findStockedGameCodes($store);
        $withSealed = $this->sealed->findStockedGameCodes($store);
        $stocked = array_unique([...$withSingles, ...$withSealed]);

        $payload = [];
        foreach ($this->games->findActive() as $game) {
            if (!in_array($game->getCode(), $stocked, true)) {
                continue;
            }

            $payload[] = $this->serializer->game($game) + [
                'hasSingles' => in_array($game->getCode(), $withSingles, true),
                'hasSealed' => in_array($game->getCode(), $withSealed, true),
            ];
        }

        return $this->json($payload);
    }

    /**
     * Staff: inventory statistics for one game — singles copies and sealed units.
     */
    #[Route('/games/{code}/stats', name: 'api_store_game_stats', methods: ['GET'])]
    public function stats(string $slug, string $code): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        $game = $this->games->findOneByCode($code);
        if (null === $game) {
            return $this->json(['detail' => 'Unknown game.'], 404);
        }

        $singles = $this->singles->statsForGame($store, $game->getCode());
        $sealed = $this->sealed->statsForGame($store, $game->getCode());

        return $this->json([
            'gameCode' => $game->getCode(),
            'gameName' => $game->getName(),
            'singles' => $singles,
            'sealed' => $sealed,
        ]);
    }

    /**
     * Public: in-stock singles counts and the set list for the storefront
     * filters. Cheap aggregates so the shop never downloads the catalog to
     * learn how many listings it has.
     */
    #[Route('/games/{code}/shelf', name: 'api_store_game_shelf', methods: ['GET'])]
    public function shelf(string $slug, string $code): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $game = $this->games->findOneByCode($code);
        if (null === $game) {
            return $this->json(['detail' => 'Unknown game.'], 404);
        }

        $stats = $this->singles->statsForGame($store, $game->getCode(), inStockOnly: true);

        return $this->json([
            'listings' => $stats['listings'],
            'copies' => $stats['copies'],
            'sets' => $this->singles->findCatalogSets($store, $game->getCode(), inStockOnly: true),
        ]);
    }
}
