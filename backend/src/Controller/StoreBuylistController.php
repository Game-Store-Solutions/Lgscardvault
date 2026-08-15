<?php

namespace App\Controller;

use App\Entity\BuylistEntry;
use App\Entity\Card;
use App\Entity\SellSubmission;
use App\Entity\SellSubmissionItem;
use App\Entity\Store;
use App\Entity\User;
use App\Enum\CardCondition;
use App\Repository\BuylistEntryRepository;
use App\Repository\CardRepository;
use App\Repository\SellSubmissionRepository;
use App\Repository\StoreRepository;
use App\Entity\StoreCreditTransaction;
use App\Service\Catalog\CatalogCardResolver;
use App\Service\Catalog\FinishVocabulary;
use App\Service\Credit\StoreCreditLedger;
use App\Service\Inventory\StoreInventoryWriter;
use App\Service\Pricing\MarketPriceResolver;
use App\Service\Store\TradeRateResolver;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Sell/Trade portal: customers sell cards to the store for store credit or
 * cash at a percentage of market price; buy-list cards pay a premium rate
 * (or a fixed per-copy offer the store pinned on the entry).
 *
 * - Buy list + trade rates reads are public (storefront portal).
 * - Buy list writes require STORE_MANAGE.
 * - Submissions: customers create + read their own; kiosk submissions are
 *   entered by staff with the walk-up customer's name; staff review with
 *   per-line accepted quantities, and completing a submission stocks the
 *   accepted cards into inventory at the payout as acquisition cost.
 * - All money is snapshotted server-side at submission time, so later
 *   market moves or buylist edits never change an in-flight submission.
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
        private readonly TradeRateResolver $tradeRates,
        private readonly StoreInventoryWriter $inventoryWriter,
        private readonly StoreCreditLedger $creditLedger,
        private readonly MarketPriceResolver $marketPrices,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /** Public: the store's effective payout rates right now (promo-resolved). */
    #[Route('/trade-rates', name: 'api_store_trade_rates', methods: ['GET'])]
    public function tradeRates(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json($this->tradeRates->resolve($store));
    }

    /** Public: the store's buy list. Staff (?all=1) also see inactive entries. */
    #[Route('/buylist', name: 'api_store_buylist_list', methods: ['GET'])]
    public function list(Request $request, string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $includeInactive = $request->query->getBoolean('all') && $this->isGranted('STORE_MANAGE', $store);
        $entries = $this->buylistEntries->findForStore($store, activeOnly: !$includeInactive);

        // Heal missing market prices for rate-based entries as the portal
        // loads — capped per request so one page view never triggers a
        // remote storm (the buy list is store-curated, so this converges).
        $heals = 0;
        foreach ($entries as $entry) {
            if ($heals >= 3) {
                break;
            }
            $card = $entry->getCard();
            if (null === $entry->getOfferCents() && null !== $card && null === $card->getPrices()) {
                $this->marketPrices->ensurePriced($card);
                ++$heals;
            }
        }

        return $this->json(array_map($this->serializeEntry(...), $entries));
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

        $offerCents = $this->readNullableNonNegativeInt($payload['offerCents'] ?? null);
        if (false === $offerCents) {
            return $this->json(['detail' => 'offerCents must be zero or more.'], 422);
        }

        // Rate-based entries need a market anchor; heal a missing price now
        // so the portal shows an offer immediately instead of a dash.
        if (null === $offerCents) {
            $card = $this->marketPrices->ensurePriced($card);
        }

        // Either the treatment by name ("Holofoil") or the old boolean; both
        // are resolved against the printing so the entry stores the game's
        // own word for it.
        $wantsFinish = FinishVocabulary::resolveForCard(
            $card,
            isset($payload['wantsFinish']) ? (string) $payload['wantsFinish'] : null,
            isset($payload['wantsFoil']) ? (bool) $payload['wantsFoil'] : null,
        );
        $existing = $this->buylistEntries->findOneBy(['store' => $store, 'card' => $card, 'wantsFinish' => $wantsFinish]);
        $entry = $existing ?? (new BuylistEntry())->setStore($store)->setCard($card)->setWantsFinish($wantsFinish);
        $entry->setOfferCents($offerCents);
        $entry->setMaxQuantity($this->readNullablePositiveInt($payload['maxQuantity'] ?? null));
        $entry->setActive((bool) ($payload['active'] ?? true));
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
            $offer = $this->readNullableNonNegativeInt($payload['offerCents']);
            if (false === $offer) {
                return $this->json(['detail' => 'offerCents must be zero or more.'], 422);
            }
            $entry->setOfferCents($offer);
        }
        if (array_key_exists('maxQuantity', $payload)) {
            $entry->setMaxQuantity($this->readNullablePositiveInt($payload['maxQuantity']));
        }
        if (array_key_exists('active', $payload)) {
            $entry->setActive((bool) $payload['active']);
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

    /**
     * Customer: submit cards to sell — any card at the base rate, buy-list
     * cards at the premium rate (or the entry's fixed offer). Staff submit
     * on the kiosk channel with the walk-up customer's name.
     */
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
        $payload = is_array($payload) ? $payload : [];

        $payoutMethod = (string) ($payload['payoutMethod'] ?? SellSubmission::PAYOUT_CASH);
        if (!in_array($payoutMethod, SellSubmission::PAYOUT_METHODS, true)) {
            return $this->json(['detail' => sprintf('Unknown payout method. Valid: %s.', implode(', ', SellSubmission::PAYOUT_METHODS))], 422);
        }

        $isKiosk = SellSubmission::CHANNEL_KIOSK === ($payload['channel'] ?? null);
        $kioskCustomerName = null;
        if ($isKiosk) {
            // Kiosk terminals run under a staff login; the walk-up customer
            // is identified by the typed name, mirroring kiosk orders.
            if (!$this->isGranted('STORE_MANAGE', $store)) {
                throw $this->createAccessDeniedException('Kiosk submissions require store staff.');
            }
            $kioskCustomerName = trim((string) ($payload['customerName'] ?? ''));
            if ('' === $kioskCustomerName) {
                return $this->json(['detail' => 'Kiosk submissions need the customer\'s name.'], 422);
            }
        }

        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
        if ([] === $items) {
            return $this->json(['detail' => 'Add at least one card to your submission.'], 422);
        }
        if (count($items) > self::MAX_SUBMISSION_ITEMS) {
            return $this->json(['detail' => sprintf('Too many lines: maximum %d per submission.', self::MAX_SUBMISSION_ITEMS)], 422);
        }

        $lines = $this->mergeSubmissionLines($items);
        if ($lines instanceof JsonResponse) {
            return $lines;
        }

        $rates = $this->tradeRates->resolve($store);
        $ratePercent = SellSubmission::PAYOUT_CREDIT === $payoutMethod ? $rates['creditPercent'] : $rates['cashPercent'];
        $buylistRatePercent = SellSubmission::PAYOUT_CREDIT === $payoutMethod ? $rates['buylistCreditPercent'] : $rates['buylistCashPercent'];

        $submission = (new SellSubmission())
            ->setStore($store)
            ->setUser($user)
            ->setPayoutMethod($payoutMethod)
            ->setChannel($isKiosk ? SellSubmission::CHANNEL_KIOSK : SellSubmission::CHANNEL_ONLINE)
            ->setKioskCustomerName($kioskCustomerName ?? null);

        $totalOffer = 0;
        $totalMarket = 0;
        $quantityLeftByEntryId = [];

        foreach ($lines as $line) {
            if (null !== $line['entryId']) {
                $entry = $this->buylistEntries->findOneForStore($store, $line['entryId']);
                if (!$entry instanceof BuylistEntry || !$entry->isActive()) {
                    return $this->json(['detail' => 'One of the lines does not reference this store\'s buy list.'], 422);
                }
                $card = $entry->getCard();
                $finish = $entry->getWantsFinish();
                $marketCents = null !== $card ? $this->marketPrices->marketPriceCents($card, $entry->wantsFoil()) : null;
                $offerCents = $entry->getOfferCents()
                    ?? $this->tradeRates->offerCents((int) $marketCents, $buylistRatePercent);
                if (null === $entry->getOfferCents() && null === $marketCents) {
                    return $this->json(['detail' => sprintf('No market price for "%s". Ask the store at the counter.', $card?->getName() ?? 'that card')], 422);
                }

                // Clamp the entry's cap across every line of the entry, so
                // split lines (different conditions) can't exceed it together.
                $quantity = $line['quantity'];
                if (null !== $entry->getMaxQuantity()) {
                    $quantityLeftByEntryId[$entry->getId()] ??= $entry->getMaxQuantity();
                    $quantity = min($quantity, $quantityLeftByEntryId[$entry->getId()]);
                    $quantityLeftByEntryId[$entry->getId()] -= $quantity;
                    if ($quantity < 1) {
                        continue;
                    }
                }
                $isFromBuylist = true;
            } else {
                $card = $this->cardRepository->find($line['cardId']);
                if (!$card instanceof Card) {
                    return $this->json(['detail' => 'One of the lines references an unknown card.'], 422);
                }
                $finish = FinishVocabulary::resolveForCard($card, $line['finish']);
                $isFoil = FinishVocabulary::isFoil($finish);
                $marketCents = $this->marketPrices->marketPriceCents($card, $isFoil);
                if (null === $marketCents) {
                    return $this->json(['detail' => sprintf('No market price for "%s"%s. Ask the store at the counter.', $card->getName(), $isFoil ? ' ('.$finish.')' : '')], 422);
                }
                $offerCents = $this->tradeRates->offerCents($marketCents, $ratePercent);
                $quantity = $line['quantity'];
                $isFromBuylist = false;
            }

            $submission->addItem((new SellSubmissionItem())
                ->setCard($card)
                ->setCardName($card?->getName() ?? 'Unknown card')
                ->setFinish($finish)
                ->setCondition($line['condition'])
                ->setQuantity($quantity)
                ->setMarketPriceCents($marketCents ?? 0)
                ->setOfferCentsEach($offerCents)
                ->setIsFromBuylist($isFromBuylist));

            $totalOffer += $quantity * $offerCents;
            $totalMarket += $quantity * ($marketCents ?? 0);
        }

        if ($submission->getItems()->isEmpty()) {
            return $this->json(['detail' => 'Nothing left to submit. The buy list caps for these cards are already met.'], 422);
        }

        $submission->setTotalOfferCents($totalOffer);
        $submission->setTotalMarketCents($totalMarket);
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

    /** Staff nav badge: submissions awaiting first review. */
    #[Route('/sell-submissions/pending-count', name: 'api_store_sell_submissions_pending_count', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function pendingSubmissionCount(string $slug): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json([
            'pendingCount' => $this->submissions->countPendingByStore($store),
        ]);
    }

    /**
     * Staff: decide a submission. Accepting may carry per-line accepted
     * quantities (partial accepts) and recomputes the offer totals to match
     * the finalized deal. Completing stocks the accepted cards into
     * inventory with the per-copy payout recorded as acquisition cost.
     */
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
        $payload = is_array($payload) ? $payload : [];

        if (array_key_exists('archived', $payload) && !array_key_exists('status', $payload)) {
            return $this->applySubmissionArchive($submission, (bool) $payload['archived']);
        }

        $status = (string) ($payload['status'] ?? '');
        if (!in_array($status, SellSubmission::STATUSES, true)) {
            return $this->json(['detail' => sprintf('Unknown status. Valid: %s.', implode(', ', SellSubmission::STATUSES))], 422);
        }
        if (!in_array($status, SellSubmission::TRANSITIONS[$submission->getStatus()] ?? [], true)) {
            return $this->json(['detail' => sprintf('Cannot move a %s submission to %s.', $submission->getStatus(), $status)], 409);
        }

        if (SellSubmission::STATUS_ACCEPTED === $status) {
            $acceptedById = [];
            foreach (is_array($payload['items'] ?? null) ? $payload['items'] : [] as $itemData) {
                if (is_array($itemData) && isset($itemData['id'])) {
                    $acceptedById[(int) $itemData['id']] = max(0, (int) ($itemData['acceptedQuantity'] ?? 0));
                }
            }

            $totalOffer = 0;
            $totalMarket = 0;
            foreach ($submission->getItems() as $item) {
                $accepted = min($acceptedById[$item->getId()] ?? $item->getQuantity(), $item->getQuantity());
                $item->setAcceptedQuantity($accepted);
                $totalOffer += $accepted * $item->getOfferCentsEach();
                $totalMarket += $accepted * $item->getMarketPriceCents();
            }
            if (0 === $totalOffer && 0 === $totalMarket) {
                return $this->json(['detail' => 'Accepting a submission needs at least one accepted copy. Decline it instead.'], 422);
            }
            $submission->setTotalOfferCents($totalOffer);
            $submission->setTotalMarketCents($totalMarket);
        }

        if (SellSubmission::STATUS_COMPLETED === $status) {
            // Store-credit payouts land on the customer's ledger when the deal
            // settles. Kiosk submissions are owned by the staff account, so the
            // walk-up customer is paid at the counter instead.
            $seller = $submission->getUser();
            if (SellSubmission::PAYOUT_CREDIT === $submission->getPayoutMethod()
                && SellSubmission::CHANNEL_KIOSK !== $submission->getChannel()
                && $submission->getTotalOfferCents() > 0
                && $seller instanceof User
            ) {
                $this->creditLedger->grant(
                    $store,
                    $seller,
                    $submission->getTotalOfferCents(),
                    StoreCreditTransaction::KIND_SELL_SUBMISSION,
                    sellSubmission: $submission,
                    note: sprintf('Sell/trade submission #%d', $submission->getId() ?? 0),
                );
            }

            foreach ($submission->getItems() as $item) {
                $quantity = $item->getAcceptedQuantity() ?? $item->getQuantity();
                $card = $item->getCard();
                if ($quantity < 1 || !$card instanceof Card) {
                    continue;
                }
                $this->inventoryWriter->write(
                    $store,
                    $card,
                    $quantity,
                    $item->getCondition(),
                    $item->getFinish(),
                    flush: false,
                    acquisitionCostCents: $item->getOfferCentsEach(),
                );
            }
        }

        $submission->setStatus($status);
        $submission->setDecidedAt(new \DateTimeImmutable());
        if (SellSubmission::STATUS_ACCEPTED === $status) {
            $submission->setArchivedAt(null);
        }
        if (in_array($status, [SellSubmission::STATUS_COMPLETED, SellSubmission::STATUS_DECLINED], true)) {
            $submission->setArchivedAt(new \DateTimeImmutable());
        }
        $this->entityManager->flush();

        return $this->json($this->serializeSubmission($submission));
    }

    private function applySubmissionArchive(SellSubmission $submission, bool $archived): JsonResponse
    {
        if ($archived) {
            if (SellSubmission::STATUS_PENDING === $submission->getStatus()) {
                return $this->json(['detail' => 'Decline pending submissions instead of archiving them.'], 422);
            }
            $submission->setArchivedAt(new \DateTimeImmutable());
        } else {
            if (!in_array($submission->getStatus(), [SellSubmission::STATUS_ACCEPTED], true)) {
                return $this->json(['detail' => 'Only accepted submissions can be restored from the archive.'], 409);
            }
            $submission->setArchivedAt(null);
        }

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

    /**
     * Normalize + merge raw submission lines. Duplicate lines of the same
     * buy-list entry / card + finish + condition merge into one; a line must
     * reference exactly one of buylistEntryId or cardId.
     *
     * @param array<int, mixed> $items
     *
     * @return JsonResponse|list<array{entryId: ?int, cardId: ?Uuid, finish: ?string, condition: CardCondition, quantity: int}>
     */
    private function mergeSubmissionLines(array $items): JsonResponse|array
    {
        $merged = [];
        foreach ($items as $i => $itemData) {
            if (!is_array($itemData)) {
                return $this->json(['detail' => sprintf('Line %d is invalid.', $i)], 422);
            }
            $quantity = (int) ($itemData['quantity'] ?? 0);
            if ($quantity < 1) {
                return $this->json(['detail' => sprintf('Line %d must have a quantity of at least 1.', $i)], 422);
            }
            $condition = CardCondition::tryFrom(strtoupper((string) ($itemData['condition'] ?? 'NM'))) ?? CardCondition::NM;

            $entryId = null;
            $cardId = null;
            if (isset($itemData['buylistEntryId'])) {
                $entryId = (int) $itemData['buylistEntryId'];
                $finish = null; // the treatment comes from the entry
                $key = sprintf('entry:%d:%s', $entryId, $condition->value);
            } else {
                try {
                    $cardId = Uuid::fromString((string) ($itemData['cardId'] ?? ''));
                } catch (\InvalidArgumentException) {
                    return $this->json(['detail' => sprintf('Line %d needs a buylistEntryId or a valid cardId.', $i)], 422);
                }
                // Named treatment wins; the boolean is the legacy client.
                $finish = FinishVocabulary::canonical((string) ($itemData['finish'] ?? ''));
                if ('' === $finish) {
                    $finish = ((bool) ($itemData['isFoil'] ?? false))
                        ? FinishVocabulary::DEFAULT_FOIL
                        : FinishVocabulary::DEFAULT_PLAIN;
                }
                $key = sprintf('card:%s:%s:%s', $cardId, $finish, $condition->value);
            }

            if (isset($merged[$key])) {
                $merged[$key]['quantity'] += $quantity;
            } else {
                $merged[$key] = ['entryId' => $entryId, 'cardId' => $cardId, 'finish' => $finish, 'condition' => $condition, 'quantity' => $quantity];
            }
        }

        return array_values($merged);
    }

    private function readNullablePositiveInt(mixed $value): ?int
    {
        if (null === $value || '' === $value) {
            return null;
        }
        $int = (int) $value;

        return $int > 0 ? $int : null;
    }

    /** Null/'' → null (rate-based); numeric >= 0 → cents; anything else → false (invalid). */
    private function readNullableNonNegativeInt(mixed $value): int|null|false
    {
        if (null === $value || '' === $value) {
            return null;
        }
        if (!is_numeric($value) || (int) $value < 0) {
            return false;
        }

        return (int) $value;
    }

    /** @return array<string, mixed> */
    private function serializeEntry(BuylistEntry $entry): array
    {
        $card = $entry->getCard();

        return [
            'id' => $entry->getId(),
            'offerCents' => $entry->getOfferCents(),
            'wantsFinish' => $entry->getWantsFinish(),
            'wantsFoil' => $entry->wantsFoil(),
            'maxQuantity' => $entry->getMaxQuantity(),
            'active' => $entry->isActive(),
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
                'cardId' => null !== $item->getCard() ? (string) $item->getCard()->getId() : null,
                'cardName' => $item->getCardName(),
                'finish' => $item->getFinish(),
                'isFoil' => $item->isFoil(),
                'condition' => $item->getCondition()->value,
                'quantity' => $item->getQuantity(),
                'acceptedQuantity' => $item->getAcceptedQuantity(),
                'offerCentsEach' => $item->getOfferCentsEach(),
                'marketPriceCents' => $item->getMarketPriceCents(),
                'isFromBuylist' => $item->isFromBuylist(),
                'imageUris' => $item->getCard()?->getImageUris(),
                'setCode' => $item->getCard()?->getSetCode(),
            ];
        }

        return [
            'id' => $submission->getId(),
            'status' => $submission->getStatus(),
            'payoutMethod' => $submission->getPayoutMethod(),
            'channel' => $submission->getChannel(),
            'kioskCustomerName' => $submission->getKioskCustomerName(),
            'totalOfferCents' => $submission->getTotalOfferCents(),
            'totalMarketCents' => $submission->getTotalMarketCents(),
            'createdAt' => $submission->getCreatedAt()->format(DATE_ATOM),
            'decidedAt' => $submission->getDecidedAt()?->format(DATE_ATOM),
            'archivedAt' => $submission->getArchivedAt()?->format(DATE_ATOM),
            'customerName' => $submission->getKioskCustomerName() ?? $submission->getUser()?->getDisplayName(),
            'customerEmail' => SellSubmission::CHANNEL_KIOSK === $submission->getChannel() ? null : $submission->getUser()?->getEmail(),
            'items' => $items,
        ];
    }
}
