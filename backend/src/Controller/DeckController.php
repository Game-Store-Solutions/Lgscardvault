<?php

namespace App\Controller;

use App\Entity\Deck;
use App\Entity\DeckCard;
use App\Entity\User;
use App\Repository\CardRepository;
use App\Repository\DeckRepository;
use App\Service\Deck\DecklistResolver;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Saved decks: user-owned, store-independent card lists. Parsing and
 * catalog resolution live in DecklistResolver; queries in DeckRepository.
 * Every route operates strictly on the signed-in user's own decks.
 */
#[Route('/api/me/decks')]
#[IsGranted('ROLE_USER')]
final class DeckController extends AbstractController
{
    private const MAX_DECKS = 100;

    public function __construct(
        private readonly DeckRepository $decks,
        private readonly CardRepository $cards,
        private readonly DecklistResolver $decklistResolver,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('', name: 'api_me_decks_list', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return $this->json(array_map(
            fn (Deck $deck) => $this->serializeDeck($deck, withCards: false),
            $this->decks->findForUser($this->requireUser()),
        ));
    }

    #[Route('', name: 'api_me_decks_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $payload = json_decode($request->getContent(), true);
        $payload = is_array($payload) ? $payload : [];

        $name = trim((string) ($payload['name'] ?? ''));
        if ('' === $name) {
            return $this->json(['detail' => 'Give the deck a name.'], 422);
        }
        if (count($this->decks->findForUser($user)) >= self::MAX_DECKS) {
            return $this->json(['detail' => sprintf('Deck limit reached (%d).', self::MAX_DECKS)], 422);
        }

        $deck = (new Deck())
            ->setUser($user)
            ->setName(mb_substr($name, 0, 120))
            ->setFormat($this->cleanShortText($payload['format'] ?? null, 40))
            ->setNotes($this->cleanShortText($payload['notes'] ?? null, 2000));

        foreach ($this->decklistResolver->resolve((string) ($payload['list'] ?? '')) as $line) {
            $deck->addCard((new DeckCard())
                ->setCard($line['card'])
                ->setCardName($line['name'])
                ->setQuantity($line['quantity']));
        }

        $this->entityManager->persist($deck);
        $this->entityManager->flush();

        return $this->json($this->serializeDeck($deck), 201);
    }

    #[Route('/{id}', name: 'api_me_decks_show', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        $deck = $this->decks->findOneForUser($this->requireUser(), $id);
        if (!$deck instanceof Deck) {
            return $this->json(['detail' => 'Deck not found.'], 404);
        }

        return $this->json($this->serializeDeck($deck));
    }

    #[Route('/{id}', name: 'api_me_decks_update', methods: ['PATCH'])]
    public function update(Request $request, int $id): JsonResponse
    {
        $deck = $this->decks->findOneForUser($this->requireUser(), $id);
        if (!$deck instanceof Deck) {
            return $this->json(['detail' => 'Deck not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        $payload = is_array($payload) ? $payload : [];
        if (array_key_exists('name', $payload)) {
            $name = trim((string) $payload['name']);
            if ('' === $name) {
                return $this->json(['detail' => 'Give the deck a name.'], 422);
            }
            $deck->setName(mb_substr($name, 0, 120));
        }
        if (array_key_exists('format', $payload)) {
            $deck->setFormat($this->cleanShortText($payload['format'], 40));
        }
        if (array_key_exists('notes', $payload)) {
            $deck->setNotes($this->cleanShortText($payload['notes'], 2000));
        }

        $deck->touch();
        $this->entityManager->flush();

        return $this->json($this->serializeDeck($deck));
    }

    #[Route('/{id}', name: 'api_me_decks_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        $deck = $this->decks->findOneForUser($this->requireUser(), $id);
        if (!$deck instanceof Deck) {
            return $this->json(['detail' => 'Deck not found.'], 404);
        }

        $this->entityManager->remove($deck);
        $this->entityManager->flush();

        return $this->json(null, 204);
    }

    /** Add a line (by cardId or free-text name); same card name merges quantities. */
    #[Route('/{id}/cards', name: 'api_me_decks_add_card', methods: ['POST'])]
    public function addCard(Request $request, int $id): JsonResponse
    {
        $deck = $this->decks->findOneForUser($this->requireUser(), $id);
        if (!$deck instanceof Deck) {
            return $this->json(['detail' => 'Deck not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        $payload = is_array($payload) ? $payload : [];
        $quantity = max(1, (int) ($payload['quantity'] ?? 1));

        $card = null;
        if (isset($payload['cardId'])) {
            try {
                $card = $this->cards->find(Uuid::fromString((string) $payload['cardId']));
            } catch (\InvalidArgumentException) {
            }
        }
        $name = $card?->getName() ?? trim((string) ($payload['name'] ?? ''));
        if ('' === $name) {
            return $this->json(['detail' => 'Provide a cardId or a card name.'], 422);
        }
        $card ??= $this->cards->findOneByExactName($name);

        foreach ($deck->getCards() as $existing) {
            if (mb_strtolower($existing->getCardName()) === mb_strtolower($name)) {
                $existing->setQuantity($existing->getQuantity() + $quantity);
                $deck->touch();
                $this->entityManager->flush();

                return $this->json($this->serializeDeck($deck));
            }
        }

        $deck->addCard((new DeckCard())->setCard($card)->setCardName($name)->setQuantity($quantity));
        $deck->touch();
        $this->entityManager->flush();

        return $this->json($this->serializeDeck($deck), 201);
    }

    #[Route('/{id}/cards/{lineId}', name: 'api_me_decks_update_card', methods: ['PATCH'])]
    public function updateCard(Request $request, int $id, int $lineId): JsonResponse
    {
        [$deck, $line] = $this->findLine($id, $lineId);
        if (!$line instanceof DeckCard) {
            return $this->json(['detail' => 'Deck line not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        $quantity = is_array($payload) ? (int) ($payload['quantity'] ?? 0) : 0;
        if ($quantity < 1) {
            return $this->json(['detail' => 'Quantity must be at least 1.'], 422);
        }

        $line->setQuantity($quantity);
        $deck->touch();
        $this->entityManager->flush();

        return $this->json($this->serializeDeck($deck));
    }

    #[Route('/{id}/cards/{lineId}', name: 'api_me_decks_remove_card', methods: ['DELETE'])]
    public function removeCard(int $id, int $lineId): JsonResponse
    {
        [$deck, $line] = $this->findLine($id, $lineId);
        if (!$line instanceof DeckCard) {
            return $this->json(['detail' => 'Deck line not found.'], 404);
        }

        $deck->getCards()->removeElement($line);
        $this->entityManager->remove($line);
        $deck->touch();
        $this->entityManager->flush();

        return $this->json($this->serializeDeck($deck));
    }

    /** @return array{0: ?Deck, 1: ?DeckCard} */
    private function findLine(int $deckId, int $lineId): array
    {
        $deck = $this->decks->findOneForUser($this->requireUser(), $deckId);
        if (!$deck instanceof Deck) {
            return [null, null];
        }
        foreach ($deck->getCards() as $line) {
            if ($line->getId() === $lineId) {
                return [$deck, $line];
            }
        }

        return [$deck, null];
    }

    private function requireUser(): User
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        return $user;
    }

    private function cleanShortText(mixed $value, int $max): ?string
    {
        $text = trim((string) ($value ?? ''));

        return '' === $text ? null : mb_substr($text, 0, $max);
    }

    /** @return array<string, mixed> */
    private function serializeDeck(Deck $deck, bool $withCards = true): array
    {
        $data = [
            'id' => $deck->getId(),
            'name' => $deck->getName(),
            'format' => $deck->getFormat(),
            'notes' => $deck->getNotes(),
            'cardCount' => $deck->cardCount(),
            'createdAt' => $deck->getCreatedAt()->format(DATE_ATOM),
            'updatedAt' => $deck->getUpdatedAt()->format(DATE_ATOM),
        ];
        if ($withCards) {
            $cards = [];
            foreach ($deck->getCards() as $line) {
                $cards[] = [
                    'id' => $line->getId(),
                    'cardId' => null !== $line->getCard() ? (string) $line->getCard()->getId() : null,
                    'cardName' => $line->getCardName(),
                    'quantity' => $line->getQuantity(),
                    'imageUris' => $line->getCard()?->getImageUris(),
                    'setCode' => $line->getCard()?->getSetCode(),
                ];
            }
            usort($cards, static fn (array $a, array $b) => strcasecmp($a['cardName'], $b['cardName']));
            $data['cards'] = $cards;
        }

        return $data;
    }
}
