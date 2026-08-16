<?php

namespace App\Service\Customer;

use App\Entity\Card;
use App\Entity\CustomerFavorite;
use App\Entity\CustomerNotification;
use App\Entity\CustomerWantListEntry;
use App\Entity\InventoryItem;
use App\Entity\SellSubmission;
use App\Entity\Store;
use App\Entity\StoreCreditTransaction;
use App\Repository\InventoryItemRepository;

/**
 * JSON for the global /api/me activity endpoints. Store slug/name ride along
 * so the profile can filter without a second round trip.
 */
final readonly class MarketplaceActivitySerializer
{
    public function __construct(
        private InventoryItemRepository $inventoryRepository,
    ) {
    }

    /** @return array<string, mixed> */
    public function wantListEntry(CustomerWantListEntry $entry): array
    {
        $store = $entry->getCustomer()?->getStore();
        $listing = $store instanceof Store
            ? $this->inventoryRepository->findListingForWantEntry(
                $store,
                $entry->getCard(),
                $entry->getCardName(),
                $entry->getSetCode(),
                $entry->getFinish(),
                $entry->isFoil(),
            )
            : null;

        return [
            'id' => $entry->getId(),
            'card' => $this->card($entry->getCard()),
            'cardName' => $entry->getCardName(),
            'setCode' => $entry->getSetCode(),
            'finish' => $entry->getFinish(),
            'isFoil' => $entry->isFoil(),
            'quantity' => $entry->getQuantity(),
            'notes' => $entry->getNotes(),
            'inventoryItemId' => $listing?->getId(),
            'createdAt' => $entry->getCreatedAt()->format(DATE_ATOM),
            'storeSlug' => $store?->getSlug(),
            'storeName' => $store?->getName(),
        ];
    }

    /** @return array<string, mixed> */
    public function favorite(CustomerFavorite $favorite): array
    {
        $store = $favorite->getCustomer()?->getStore();

        return [
            'id' => $favorite->getId(),
            'inventoryItem' => $this->inventoryItem($favorite->getInventoryItem()),
            'createdAt' => $favorite->getCreatedAt()->format(DATE_ATOM),
            'storeSlug' => $store?->getSlug(),
            'storeName' => $store?->getName(),
        ];
    }

    /** @return array<string, mixed> */
    public function notification(CustomerNotification $notification): array
    {
        $store = $notification->getStore();

        return [
            'id' => $notification->getId(),
            'type' => $notification->getType(),
            'title' => $notification->getTitle(),
            'body' => $notification->getBody(),
            'orderId' => $notification->getRelatedOrder()?->getId(),
            'orderReference' => $notification->getRelatedOrder()?->getReference(),
            'createdAt' => $notification->getCreatedAt()->format(DATE_ATOM),
            'readAt' => $notification->getReadAt()?->format(DATE_ATOM),
            'storeSlug' => $store?->getSlug(),
            'storeName' => $store?->getName(),
        ];
    }

    /** @return array<string, mixed> */
    public function creditTransaction(StoreCreditTransaction $transaction): array
    {
        $store = $transaction->getStore();

        return [
            'id' => $transaction->getId(),
            'amountCents' => $transaction->getAmountCents(),
            'kind' => $transaction->getKind(),
            'note' => $transaction->getNote(),
            'orderReference' => $transaction->getOrder()?->getReference(),
            'sellSubmissionId' => $transaction->getSellSubmission()?->getId(),
            'createdAt' => $transaction->getCreatedAt()->format(DATE_ATOM),
            'storeSlug' => $store?->getSlug(),
            'storeName' => $store?->getName(),
        ];
    }

    /** @return array<string, mixed> */
    public function sellSubmission(SellSubmission $submission): array
    {
        $store = $submission->getStore();
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
            'storeSlug' => $store?->getSlug(),
            'storeName' => $store?->getName(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function inventoryItem(?InventoryItem $item): ?array
    {
        if (!$item instanceof InventoryItem) {
            return null;
        }

        return [
            'id' => $item->getId(),
            'quantity' => $item->getQuantity(),
            'priceCents' => $item->getPriceCents(),
            'condition' => $item->getCondition()->value,
            'finish' => $item->getFinish(),
            'isFoil' => $item->isFoil(),
            'notes' => $item->getNotes(),
            'card' => $this->card($item->getCard()),
        ];
    }

    /** @return array<string, mixed>|null */
    private function card(?Card $card): ?array
    {
        if (!$card instanceof Card) {
            return null;
        }

        return [
            'id' => (string) $card->getId(),
            'oracleId' => (string) $card->getOracleId(),
            'name' => $card->getName(),
            'setCode' => $card->getSetCode(),
            'setName' => $card->getSetName(),
            'collectorNumber' => $card->getCollectorNumber(),
            'rarity' => $card->getRarity(),
            'typeLine' => $card->getTypeLine(),
            'imageUrl' => $card->getImageUrl(),
            'imageUris' => $card->getImageUris(),
            'prices' => $card->getPrices(),
        ];
    }
}
