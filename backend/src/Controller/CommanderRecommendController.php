<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\Store;
use App\Repository\CardRepository;
use App\Repository\StoreRepository;
use App\Service\Catalog\CatalogCardResolver;
use App\Service\Recommend\CommanderRecommender;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Store-scoped commander synergy recommendations.
 *
 * Public GET (matches inventory browse): shoppers pick a commander, see
 * in-stock synergies, then add individually or en masse via the existing
 * cart endpoints.
 */
#[Route('/api/stores/{slug}/recommend')]
final class CommanderRecommendController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly CardRepository $cards,
        private readonly CatalogCardResolver $catalogCardResolver,
        private readonly CommanderRecommender $recommender,
    ) {
    }

    /** Search legendary creatures that can be commanders. */
    #[Route('/commanders', name: 'api_store_recommend_commanders', methods: ['GET'])]
    public function searchCommanders(string $slug, Request $request): JsonResponse
    {
        if (!$this->requireStore($slug) instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $q = trim((string) $request->query->get('q', ''));
        $limit = (int) $request->query->get('limit', 12);
        $results = $this->cards->searchCommanders($q, $limit);

        return $this->json(array_map(
            fn (Card $card) => $this->serializeCommander($card),
            $results,
        ));
    }

    /** Ranked in-stock synergies for one commander printing. */
    #[Route('/commander/{cardId}', name: 'api_store_recommend_for_commander', methods: ['GET'])]
    public function recommend(string $slug, string $cardId, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $commander = $this->cards->findOneMagicById($cardId);
        if (!$commander instanceof Card) {
            return $this->json(['detail' => 'Commander not found.'], 404);
        }

        if (!$this->looksLikeCommander($commander)) {
            return $this->json(['detail' => 'That card is not a legendary creature commander.'], 422);
        }

        $limit = (int) $request->query->get('limit', 24);

        return $this->json($this->recommender->recommendForStore($store, $commander, $limit));
    }

    private function requireStore(string $slug): ?Store
    {
        return $this->stores->findOneBy(['slug' => $slug, 'isActive' => true]);
    }

    private function looksLikeCommander(Card $card): bool
    {
        $type = strtolower($card->getTypeLine() ?? '');

        return str_contains($type, 'legendary') && str_contains($type, 'creature');
    }

    /** @return array<string, mixed> */
    private function serializeCommander(Card $card): array
    {
        $base = $this->catalogCardResolver->serializeCard($card);

        return [
            'id' => $base['id'],
            'oracleId' => $base['oracleId'],
            'name' => $base['name'],
            'typeLine' => $base['typeLine'],
            'manaCost' => $base['manaCost'],
            'cmc' => $base['cmc'],
            'colorIdentity' => $base['colorIdentity'] ?? [],
            'imageUrl' => $base['imageUrl'],
            'setCode' => $base['setCode'],
            'setName' => $base['setName'],
        ];
    }
}
