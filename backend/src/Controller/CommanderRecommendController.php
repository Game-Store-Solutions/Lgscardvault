<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\Commander;
use App\Entity\Store;
use App\Repository\CardRepository;
use App\Repository\CommanderRepository;
use App\Repository\StoreRepository;
use App\Service\Recommend\CommanderDeckAssembler;
use App\Service\Recommend\CommanderRecommender;
use App\Service\Recommend\StoreComboAnalyzer;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

/**
 * Store-scoped commander deck builder.
 *
 * Commander typeahead reads the weekly-synced `commanders` table. After the
 * shopper picks a commander (and a strategy that commander supports),
 * recommendations return in-stock enabler / fuel / payoff packages grouped
 * by card type. Spellbook combo and full-deck assembly stay available.
 */
#[Route('/api/stores/{slug}/recommend')]
final class CommanderRecommendController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly CardRepository $cards,
        private readonly CommanderRepository $commanders,
        private readonly CommanderRecommender $recommender,
        private readonly StoreComboAnalyzer $comboAnalyzer,
        private readonly CommanderDeckAssembler $deckAssembler,
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

    /** Strategies this commander supports (for the strategy picker). */
    #[Route('/commander/{cardId}/strategies', name: 'api_store_recommend_commander_strategies', methods: ['GET'])]
    public function strategies(string $slug, string $cardId): JsonResponse
    {
        if (!$this->requireStore($slug) instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $commanderCard = $this->resolveListedCommander($cardId);
        if ($commanderCard instanceof JsonResponse) {
            return $commanderCard;
        }

        return $this->json([
            'commander' => [
                'id' => (string) $commanderCard->getId(),
                'name' => $commanderCard->getName(),
            ],
            'strategies' => $this->recommender->strategiesFor($commanderCard),
        ]);
    }

    /**
     * Strategy-scoped in-stock deck package for one commander.
     * Query: ?strategy=proliferate&limit=80
     */
    #[Route('/commander/{cardId}', name: 'api_store_recommend_for_commander', methods: ['GET'])]
    public function recommend(string $slug, string $cardId, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $commanderCard = $this->resolveListedCommander($cardId);
        if ($commanderCard instanceof JsonResponse) {
            return $commanderCard;
        }

        $strategy = trim((string) $request->query->get('strategy', ''));
        $limit = (int) $request->query->get('limit', 80);

        try {
            return $this->json($this->recommender->recommendForStore(
                $store,
                $commanderCard,
                '' === $strategy ? null : $strategy,
                $limit,
                $this->deckOracleIds($request),
                $request->query->getBoolean('includeOutOfStock', true),
            ));
        } catch (\InvalidArgumentException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }
    }

    /**
     * Same recommendations, but told what is already in the deck so the ranking
     * reflects it.
     *
     * POST because a 99-card list does not belong in a query string, and because
     * this is the endpoint the builder calls after every add or remove.
     *
     * Body: `{ "deck": ["<oracleId>", ...], "strategy": "tokens", "limit": 40 }`
     */
    #[Route('/commander/{cardId}/next-cards', name: 'api_store_recommend_next_cards', methods: ['POST'])]
    public function nextCards(string $slug, string $cardId, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $commanderCard = $this->resolveListedCommander($cardId);
        if ($commanderCard instanceof JsonResponse) {
            return $commanderCard;
        }

        $payload = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($payload)) {
            $payload = [];
        }

        $strategy = trim((string) ($payload['strategy'] ?? $request->query->get('strategy', '')));
        $limit = (int) ($payload['limit'] ?? $request->query->get('limit', 40));

        try {
            return $this->json($this->recommender->recommendForStore(
                $store,
                $commanderCard,
                '' === $strategy ? null : $strategy,
                $limit,
                $this->deckOracleIdsFromPayload($payload),
                (bool) ($payload['includeOutOfStock'] ?? true),
            ));
        } catch (\InvalidArgumentException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }
    }

    /**
     * Commander Spellbook combos for this commander, annotated with store stock.
     *
     * Body (optional JSON): `{ "cards": ["Sol Ring", "..."] }` — extra names
     * from the shopper's current picks improve find-my-combos accuracy.
     */
    #[Route('/commander/{cardId}/combos', name: 'api_store_recommend_combos', methods: ['GET', 'POST'])]
    public function combos(string $slug, string $cardId, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $commanderCard = $this->resolveListedCommander($cardId);
        if ($commanderCard instanceof JsonResponse) {
            return $commanderCard;
        }

        $extra = [];
        if ($request->isMethod('POST')) {
            $payload = json_decode($request->getContent() ?: '[]', true);
            if (is_array($payload['cards'] ?? null)) {
                foreach ($payload['cards'] as $name) {
                    if (is_string($name) && '' !== trim($name)) {
                        $extra[] = trim($name);
                    }
                }
            }
        }

        $limit = (int) $request->query->get('limit', 20);

        return $this->json($this->comboAnalyzer->analyzeForCommander($store, $commanderCard, $extra, $limit));
    }

    /**
     * Assemble a 100-card list for a commander and a chosen strategy.
     *
     * Query: strategy, budgetCents, maxCardCents, bracket (1–5), includeOutOfStock.
     * Omit bracket to auto-pick from in-stock Game Changers in this identity.
     */
    #[Route('/commander/{cardId}/deck', name: 'api_store_recommend_deck', methods: ['GET'])]
    public function assembleDeck(string $slug, string $cardId, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $commanderCard = $this->resolveListedCommander($cardId);
        if ($commanderCard instanceof JsonResponse) {
            return $commanderCard;
        }

        $bracketRaw = trim((string) $request->query->get('bracket', ''));
        $strategy = trim((string) $request->query->get('strategy', ''));

        try {
            return $this->json($this->deckAssembler->assemble($store, $commanderCard, [
                'strategy' => '' === $strategy ? null : $strategy,
                'budgetCents' => $this->optionalPositiveInt($request->query->get('budgetCents')),
                'maxCardCents' => $this->optionalPositiveInt($request->query->get('maxCardCents')),
                'bracket' => '' === $bracketRaw || 'auto' === strtolower($bracketRaw)
                    ? null
                    : (int) $bracketRaw,
                'includeOutOfStock' => $request->query->getBoolean('includeOutOfStock', true),
            ]));
        } catch (\InvalidArgumentException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }
    }

    private function optionalPositiveInt(mixed $value): ?int
    {
        if (null === $value || '' === $value) {
            return null;
        }
        $n = (int) $value;

        return $n > 0 ? $n : null;
    }

    /**
     * Oracle ids of cards already in the deck, from a repeated `deck[]` query
     * parameter. Kept small on purpose — the POST endpoint exists for full lists.
     *
     * @return list<string>
     */
    private function deckOracleIds(Request $request): array
    {
        return $this->normalizeOracleIds((array) $request->query->all('deck'));
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @return list<string>
     */
    private function deckOracleIdsFromPayload(array $payload): array
    {
        return $this->normalizeOracleIds(is_array($payload['deck'] ?? null) ? $payload['deck'] : []);
    }

    /**
     * @param array<int|string, mixed> $values
     *
     * @return list<string>
     */
    private function normalizeOracleIds(array $values): array
    {
        $out = [];
        foreach ($values as $value) {
            if (!is_string($value)) {
                continue;
            }
            $trimmed = strtolower(trim($value));
            // Validated as a UUID here so a malformed id becomes a no-op rather
            // than a database error deeper in the pipeline.
            if ('' === $trimmed || isset($out[$trimmed]) || !Uuid::isValid($trimmed)) {
                continue;
            }
            $out[$trimmed] = true;
        }

        return array_keys($out);
    }

    private function resolveListedCommander(string $cardId): Card|JsonResponse
    {
        $commanderCard = $this->cards->findOneMagicById($cardId);
        if (!$commanderCard instanceof Card) {
            return $this->json(['detail' => 'Commander not found.'], 404);
        }

        $listed = $this->commanders->findOneByOracleId($commanderCard->getOracleId());
        if (!$listed instanceof Commander && !$this->looksLikeCommander($commanderCard)) {
            return $this->json(['detail' => 'That card is not a legal commander.'], 422);
        }

        return $commanderCard;
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
