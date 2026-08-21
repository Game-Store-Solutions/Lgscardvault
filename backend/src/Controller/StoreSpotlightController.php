<?php

namespace App\Controller;

use App\Repository\StoreRepository;
use App\Service\Store\StoreSpotlightAssembler;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/stores/{slug}')]
final class StoreSpotlightController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly StoreSpotlightAssembler $spotlight,
    ) {
    }

    /** Public: assembled singles rail for the storefront spotlight. */
    #[Route('/spotlight', name: 'api_store_spotlight', methods: ['GET'])]
    public function show(Request $request, string $slug): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $gameCode = trim((string) $request->query->get('game', ''));
        $items = $this->spotlight->assemble($store, '' !== $gameCode ? $gameCode : null);

        return $this->json(
            [
                'items' => $items,
                'total' => count($items),
            ],
            200,
            [],
            ['groups' => ['inventory:read']],
        );
    }
}
