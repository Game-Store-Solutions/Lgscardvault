<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\Commander;
use App\Entity\Store;
use App\Repository\CardRepository;
use App\Repository\CommanderRepository;
use App\Repository\StoreRepository;
use App\Service\Recommend\CommanderRecommender;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Store-scoped commander synergy recommendations.
 *
 * Commander typeahead reads the weekly-synced `commanders` table (Scryfall
 * `is:commander`) — not store inventory — so shoppers can pick any legal
 * commander. Recommendations themselves still filter to in-stock listings.
 */
#[Route('/api/stores/{slug}/recommend')]
final class CommanderRecommendController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly CardRepository $cards,
        private readonly CommanderRepository $commanders,
        private readonly CommanderRecommender $recommender,
    ) {
    }

    /**
     * Search every Scryfall-legal commander in the local catalog.
     * Independent of what the store currently stocks.
     */
    #[Route('/commanders', name: 'api_store_recommend_commanders', methods: ['GET'])]
    public function searchCommanders(string $slug, Request $request): JsonResponse
    {
        if (!$this->requireStore($slug) instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $q = trim((string) $request->query->get('q', ''));
        $limit = (int) $request->query->get('limit', 12);
        $results = $this->commanders->searchByName($q, $limit);

        return $this->json(array_map(
            fn (Commander $commander) => $this->serializeCommander($commander),
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

        $commanderCard = $this->cards->findOneMagicById($cardId);
        if (!$commanderCard instanceof Card) {
            return $this->json(['detail' => 'Commander not found.'], 404);
        }

        // Prefer an explicit commanders-table membership; fall back to type
        // line for freshly seeded printings that have not been weekly-synced yet.
        $listed = $this->commanders->findOneByOracleId($commanderCard->getOracleId());
        if (!$listed instanceof Commander && !$this->looksLikeCommander($commanderCard)) {
            return $this->json(['detail' => 'That card is not a legal commander.'], 422);
        }

        $limit = (int) $request->query->get('limit', 24);

        return $this->json($this->recommender->recommendForStore($store, $commanderCard, $limit));
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
    private function serializeCommander(Commander $commander): array
    {
        $card = $commander->getCard();

        return [
            'id' => (string) $card->getId(),
            'oracleId' => (string) $commander->getOracleId(),
            'name' => $commander->getName(),
            'typeLine' => $commander->getTypeLine(),
            'manaCost' => $commander->getManaCost(),
            'cmc' => $commander->getCmc(),
            'colorIdentity' => $commander->getColorIdentity() ?? [],
            'imageUrl' => $commander->getImageUri() ?? $card->getImageUrl(),
            'setCode' => $card->getSetCode(),
            'setName' => $card->getSetName(),
        ];
    }
}
