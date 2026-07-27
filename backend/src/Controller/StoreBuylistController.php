<?php

namespace App\Controller;

use App\Entity\BuylistEntry;
use App\Entity\Card;
use App\Entity\SellSubmission;
use App\Entity\SellSubmissionItem;
use App\Entity\Store;
use App\Entity\User;
use App\Repository\BuylistEntryRepository;
use App\Repository\CardRepository;
use App\Repository\SellSubmissionRepository;
use App\Repository\StoreRepository;
use App\Service\Catalog\CatalogCardResolver;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Sell/Trade portal: the store-curated buy list (what the store pays for
 * which cards) and customer sell submissions against it.
 *
 * - Buy list reads are public (storefront portal).
 * - Buy list writes require STORE_MANAGE.
 * - Submissions: customers create + read their own; staff list and decide.
 *   Offers are snapshotted onto submission lines, so later buylist edits
 *   never change an in-flight submission.
 */
#[Route('/api/stores/{slug}')]
final class StoreBuylistController extends AbstractController
{
    private const MAX_SUBMISSION_ITEMS = 200;

    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly BuylistEntryRepository $buylistEntries,
        private readonly SellSubmissionRepository $submissions,
        private readonly CardRepository $cardRepository,
        private readonly CatalogCardResolver $catalogCardResolver,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /** Public: the store's buy list, highest offers first. */
    #[Route('/buylist', name: 'api_store_buylist_list', methods: ['GET'])]
    public function list(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json(array_map($this->serializeEntry(...), $this->buylistEntries->findForStore($store)));
    }

    #[Route('/buylist', name: 'api_store_buylist_create', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function create(Request $request, string $slug): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        try {
            $card = $this->cardRepository->find(Uuid::fromString((string) ($payload['cardId'] ?? '')));
        } catch (\InvalidArgumentException) {
            $card = null;
        }
        if (!$card instanceof Card) {
            return $this->json(['detail' => 'A valid cardId is required.'], 422);
        }

        $offerCents = (int) ($payload['offerCents'] ?? -1);
        if ($offerCents < 0) {
            return $this->json(['detail' => 'offerCents must be zero or more.'], 422);
        }

        $wantsFoil = (bool) ($payload['wantsFoil'] ?? false);
        $existing = $this->buylistEntries->findOneBy(['store' => $store, 'card' => $card, 'wantsFoil' => $wantsFoil]);
        $entry = $existing ?? (new BuylistEntry())->setStore($store)->setCard($card)->setWantsFoil($wantsFoil);
        $entry->setOfferCents($offerCents);
        $entry->setMaxQuantity($this->readNullablePositiveInt($payload['maxQuantity'] ?? null));
        $notes = trim((string) ($payload['notes'] ?? ''));
        $entry->setNotes('' === $notes ? null : mb_substr($notes, 0, 255));

        $this->entityManager->persist($entry);
        $this->entityManager->flush();

        return $this->json($this->serializeEntry($entry), null === $existing ? 201 : 200);
    }

    #[Route('/buylist/{id}', name: 'api_store_buylist_update', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function update(Request $request, string $slug, int $id): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        $entry = $store instanceof Store ? $this->buylistEntries->findOneForStore($store, $id) : null;
        if (!$entry instanceof BuylistEntry) {
            return $this->json(['detail' => 'Buy list entry not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        if (array_key_exists('offerCents', $payload)) {
            $offer = (int) $payload['offerCents'];
            if ($offer < 0) {
                return $this->json(['detail' => 'offerCents must be zero or more.'], 422);
            }
            $entry->setOfferCents($offer);
        }
        if (array_key_exists('maxQuantity', $payload)) {
            $entry->setMaxQuantity($this->readNullablePositiveInt($payload['maxQuantity']));
        }
        if (array_key_exists('notes', $payload)) {
            $notes = trim((string) ($payload['notes'] ?? ''));
            $entry->setNotes('' === $notes ? null : mb_substr($notes, 0, 255));
        }

        $this->entityManager->flush();

        return $this->json($this->serializeEntry($entry));
    }

    #[Route('/buylist/{id}', name: 'api_store_buylist_delete', methods: ['DELETE'])]
    #[IsGranted('ROLE_USER')]
    public function delete(string $slug, int $id): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        $entry = $store instanceof Store ? $this->buylistEntries->findOneForStore($store, $id) : null;
        if (!$entry instanceof BuylistEntry) {
            return $this->json(['detail' => 'Buy list entry not found.'], 404);
        }

        $this->entityManager->remove($entry);
        $this->entityManager->flush();

        return $this->json(null, 204);
    }

    /** Customer: submit an offer to sell cards from the buy list. */
    #[Route('/sell-submissions', name: 'api_store_sell_submission_create', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function createSubmission(Request $request, string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $payload = json_decode($request->getContent(), true);
        $items = is_array($payload) && is_array($payload['items'] ?? null) ? $payload['items'] : [];
        if ([] === $items) {
            return $this->json(['detail' => 'Add at least one card to your submission.'], 422);
        }
        if (count($items) > self::MAX_SUBMISSION_ITEMS) {
            return $this->json(['detail' => sprintf('Too many lines: maximum %d per submission.', self::MAX_SUBMISSION_ITEMS)], 422);
        }

        // Merge duplicate lines per buy-list entry BEFORE clamping, so
        // splitting one card across several lines can't exceed the entry's
        // max-quantity cap.
        $quantityByEntryId = [];
        foreach ($items as $i => $itemData) {
            if (!is_array($itemData)) {
                return $this->json(['detail' => sprintf('Line %d is invalid.', $i)], 422);
            }
            $quantity = (int) ($itemData['quantity'] ?? 0);
            if ($quantity < 1) {
                return $this->json(['detail' => sprintf('Line %d must have a quantity of at least 1.', $i)], 422);
            }
            $entryId = (int) ($itemData['buylistEntryId'] ?? 0);
            $quantityByEntryId[$entryId] = ($quantityByEntryId[$entryId] ?? 0) + $quantity;
        }

        $submission = (new SellSubmission())->setStore($store)->setUser($user);
        $total = 0;

        foreach ($quantityByEntryId as $entryId => $quantity) {
            $entry = $this->buylistEntries->findOneForStore($store, $entryId);
            if (!$entry instanceof BuylistEntry) {
                return $this->json(['detail' => 'One of the lines does not reference this store\'s buy list.'], 422);
            }

            if (null !== $entry->getMaxQuantity()) {
                $quantity = min($quantity, $entry->getMaxQuantity());
            }

            $line = (new SellSubmissionItem())
                ->setCard($entry->getCard())
                ->setCardName($entry->getCard()?->getName() ?? 'Unknown card')
                ->setIsFoil($entry->wantsFoil())
                ->setQuantity($quantity)
                ->setOfferCentsEach($entry->getOfferCents());

            $submission->addItem($line);
            $total += $quantity * $entry->getOfferCents();
        }

        $submission->setTotalOfferCents($total);
        $this->entityManager->persist($submission);
        $this->entityManager->flush();

        return $this->json($this->serializeSubmission($submission), 201);
    }

    /** Customer: their own submission history at this store (profile sell/trade history). */
    #[Route('/customer/sell-submissions', name: 'api_store_customer_sell_submissions', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function mySubmissions(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        return $this->json(array_map($this->serializeSubmission(...), $this->submissions->findForUserAndStore($user, $store)));
    }

    /** Staff: all submissions for the store. */
    #[Route('/sell-submissions', name: 'api_store_sell_submissions_list', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function listSubmissions(string $slug): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json(array_map($this->serializeSubmission(...), $this->submissions->findForStore($store)));
    }

    /** Staff: accept / decline / complete a submission. */
    #[Route('/sell-submissions/{id}', name: 'api_store_sell_submission_update', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function updateSubmission(Request $request, string $slug, int $id): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        $submission = $store instanceof Store ? $this->submissions->findOneBy(['store' => $store, 'id' => $id]) : null;
        if (!$submission instanceof SellSubmission) {
            return $this->json(['detail' => 'Submission not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        $status = is_array($payload) ? (string) ($payload['status'] ?? '') : '';
        if (!in_array($status, SellSubmission::STATUSES, true)) {
            return $this->json(['detail' => sprintf('Unknown status. Valid: %s.', implode(', ', SellSubmission::STATUSES))], 422);
        }
        if (!in_array($status, SellSubmission::TRANSITIONS[$submission->getStatus()] ?? [], true)) {
            return $this->json(['detail' => sprintf('Cannot move a %s submission to %s.', $submission->getStatus(), $status)], 409);
        }

        $submission->setStatus($status);
        $submission->setDecidedAt(new \DateTimeImmutable());
        $this->entityManager->flush();

        return $this->json($this->serializeSubmission($submission));
    }

    private function findManagedStore(string $slug): ?Store
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return null;
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $store;
    }

    private function readNullablePositiveInt(mixed $value): ?int
    {
        if (null === $value || '' === $value) {
            return null;
        }
        $int = (int) $value;

        return $int > 0 ? $int : null;
    }

    /** @return array<string, mixed> */
    private function serializeEntry(BuylistEntry $entry): array
    {
        $card = $entry->getCard();

        return [
            'id' => $entry->getId(),
            'offerCents' => $entry->getOfferCents(),
            'wantsFoil' => $entry->wantsFoil(),
            'maxQuantity' => $entry->getMaxQuantity(),
            'notes' => $entry->getNotes(),
            'createdAt' => $entry->getCreatedAt()->format(DATE_ATOM),
            'card' => null !== $card ? $this->catalogCardResolver->serializeCard($card) : null,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeSubmission(SellSubmission $submission): array
    {
        $items = [];
        foreach ($submission->getItems() as $item) {
            $items[] = [
                'id' => $item->getId(),
                'cardName' => $item->getCardName(),
                'isFoil' => $item->isFoil(),
                'quantity' => $item->getQuantity(),
                'offerCentsEach' => $item->getOfferCentsEach(),
                'imageUris' => $item->getCard()?->getImageUris(),
                'setCode' => $item->getCard()?->getSetCode(),
            ];
        }

        return [
            'id' => $submission->getId(),
            'status' => $submission->getStatus(),
            'totalOfferCents' => $submission->getTotalOfferCents(),
            'createdAt' => $submission->getCreatedAt()->format(DATE_ATOM),
            'decidedAt' => $submission->getDecidedAt()?->format(DATE_ATOM),
            'customerName' => $submission->getUser()?->getDisplayName(),
            'customerEmail' => $submission->getUser()?->getEmail(),
            'items' => $items,
        ];
    }
}
