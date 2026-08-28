<?php

namespace App\Controller;

use App\Entity\Card;
use App\Entity\Commander;
use App\Repository\CardRepository;
use App\Repository\CommanderRepository;
use App\Service\Recommend\CommanderDeckAssembler;
use App\Service\Recommend\CommanderRecommender;
use App\Service\Recommend\StoreComboAnalyzer;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

/**
 * Store-agnostic commander deck builder API.
 *
 * Same payloads as the store-scoped endpoints, but recommendations are drawn
 * from the full Magic catalog rather than a single store's inventory.
 */
#[Route('/api/recommend')]
final class PublicCommanderRecommendController extends AbstractController
{
    public function __construct(
        private readonly CardRepository $cards,
        private readonly CommanderRepository $commanders,
        private readonly CommanderRecommender $recommender,
        private readonly StoreComboAnalyzer $comboAnalyzer,
        private readonly CommanderDeckAssembler $deckAssembler,
    ) {
    }

    #[Route('/commanders', name: 'api_public_recommend_commanders', methods: ['GET'])]
    public function searchCommanders(Request $request): JsonResponse
    {
        $q = trim((string) $request->query->get('q', ''));
        $limit = (int) $request->query->get('limit', 12);
        $results = $this->commanders->searchByName($q, $limit);

        return $this->json(array_map(
            fn (Commander $commander) => $this->serializeCommander($commander),
            $results,
        ));
    }

    #[Route('/commander/{cardId}/strategies', name: 'api_public_recommend_commander_strategies', methods: ['GET'])]
    public function strategies(string $cardId): JsonResponse
    {
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

    #[Route('/commander/{cardId}', name: 'api_public_recommend_for_commander', methods: ['GET'])]
    public function recommend(string $cardId, Request $request): JsonResponse
    {
        $commanderCard = $this->resolveListedCommander($cardId);
        if ($commanderCard instanceof JsonResponse) {
            return $commanderCard;
        }

        $strategy = trim((string) $request->query->get('strategy', ''));
        $limit = (int) $request->query->get('limit', 80);

        try {
            return $this->json($this->recommender->recommendForStore(
                null,
                $commanderCard,
                '' === $strategy ? null : $strategy,
                $limit,
                $this->deckOracleIds($request),
                true,
            ));
        } catch (\InvalidArgumentException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }
    }

    #[Route('/commander/{cardId}/next-cards', name: 'api_public_recommend_next_cards', methods: ['POST'])]
    public function nextCards(string $cardId, Request $request): JsonResponse
    {
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
                null,
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

    #[Route('/commander/{cardId}/combos', name: 'api_public_recommend_combos', methods: ['GET', 'POST'])]
    public function combos(string $cardId, Request $request): JsonResponse
    {
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

        return $this->json($this->comboAnalyzer->analyzeForCommander(null, $commanderCard, $extra, $limit));
    }

    #[Route('/commander/{cardId}/deck', name: 'api_public_recommend_deck', methods: ['GET'])]
    public function assembleDeck(string $cardId, Request $request): JsonResponse
    {
        $commanderCard = $this->resolveListedCommander($cardId);
        if ($commanderCard instanceof JsonResponse) {
            return $commanderCard;
        }

        $bracketRaw = trim((string) $request->query->get('bracket', ''));
        $strategy = trim((string) $request->query->get('strategy', ''));

        try {
            return $this->json($this->deckAssembler->assemble(null, $commanderCard, [
                'strategy' => '' === $strategy ? null : $strategy,
                'budgetCents' => $this->optionalPositiveInt($request->query->get('budgetCents')),
                'maxCardCents' => $this->optionalPositiveInt($request->query->get('maxCardCents')),
                'bracket' => '' === $bracketRaw || 'auto' === strtolower($bracketRaw)
                    ? null
                    : (int) $bracketRaw,
                'includeOutOfStock' => true,
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
