<?php

namespace App\Service\CaseCards;

use App\Entity\InventoryItem;
use App\Entity\StoreCase;
use App\Entity\StoreSection;
use App\Service\Catalog\CatalogCardResolver;

/**
 * JSON shapes for the Case Cards API — shared by the case and section
 * controllers so the storefront and admin views always agree.
 */
final class SectionSerializer
{
    public function __construct(
        private readonly CatalogCardResolver $catalogCardResolver,
        private readonly ColorIdentityParser $colorIdentityParser,
    ) {
    }

    public function serializeCase(StoreCase $case): array
    {
        return [
            'id' => $case->getId(),
            'name' => $case->getName(),
            'position' => $case->getPosition(),
            'createdAt' => $case->getCreatedAt()->format(DATE_ATOM),
            'sections' => array_map(
                $this->serializeSection(...),
                $case->getSections()->toArray(),
            ),
        ];
    }

    public function serializeSection(StoreSection $section): array
    {
        $cards = [];
        $available = 0;
        foreach ($section->getCards() as $card) {
            $item = $card->getInventoryItem();
            if (!$item instanceof InventoryItem) {
                continue;
            }
            $available += $card->remaining();
            $cards[] = [
                'id' => $card->getId(),
                'position' => $card->getPosition(),
                'quantity' => $card->getQuantity(),
                'soldQuantity' => $card->getSoldQuantity(),
                'remaining' => $card->remaining(),
                'stockedAt' => $card->getStockedAt()?->format(DATE_ATOM),
                'needsStocking' => $card->needsStocking(),
                'inventoryItem' => $this->serializeInventoryItem($item),
            ];
        }

        $colorCode = $section->getAutoColorIdentity();
        $case = $section->getStoreCase();

        return [
            'id' => $section->getId(),
            'case' => null !== $case ? ['id' => $case->getId(), 'name' => $case->getName()] : null,
            'title' => $section->getTitle(),
            'position' => $section->getPosition(),
            'mode' => $section->getMode(),
            'autoMinPriceCents' => $section->getAutoMinPriceCents(),
            'autoMaxPriceCents' => $section->getAutoMaxPriceCents(),
            'autoRarity' => $section->getAutoRarity(),
            'autoColorIdentity' => $colorCode,
            'autoColorIdentityLabel' => null !== $colorCode ? $this->colorIdentityParser->label($colorCode) : null,
            'autoSetCode' => $section->getAutoSetCode(),
            'autoCardType' => $section->getAutoCardType(),
            'cardLimit' => $section->getCardLimit(),
            'availableQuantity' => $available,
            'createdAt' => $section->getCreatedAt()->format(DATE_ATOM),
            'cards' => $cards,
        ];
    }

    public function serializeInventoryItem(InventoryItem $item): array
    {
        $card = $item->getCard();

        return [
            'id' => $item->getId(),
            'priceCents' => $item->getPriceCents(),
            'quantity' => $item->getQuantity(),
            'condition' => $item->getCondition()->value,
            'finish' => $item->getFinish(),
            'isFoil' => $item->isFoil(),
            'card' => null !== $card ? $this->catalogCardResolver->serializeCard($card) : null,
        ];
    }
}
