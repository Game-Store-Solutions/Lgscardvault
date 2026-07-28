<?php

namespace App\Service\Catalog;

use App\Entity\CatalogSyncRun;
use App\Entity\Game;
use App\Entity\GameSet;
use App\Entity\SealedInventoryItem;
use App\Entity\SealedProduct;

/**
 * JSON shapes for the multi-game catalog (games, sets, sealed products,
 * sealed inventory, sync runs). Kept in one service so every controller
 * returns identical payloads for the same entity.
 */
final readonly class GameCatalogSerializer
{
    /** @return array<string, mixed> */
    public function game(Game $game): array
    {
        return [
            'id' => $game->getId(),
            'code' => $game->getCode(),
            'name' => $game->getName(),
            'tcgcsvCategoryId' => $game->getTcgcsvCategoryId(),
            'position' => $game->getPosition(),
            'active' => $game->isActive(),
        ];
    }

    /** @return array<string, mixed> */
    public function gameSet(GameSet $set): array
    {
        return [
            'id' => $set->getId(),
            'gameCode' => $set->getGame()?->getCode(),
            'tcgcsvGroupId' => $set->getTcgcsvGroupId(),
            'name' => $set->getName(),
            'code' => $set->getCode(),
            'releaseDate' => $set->getReleaseDate()?->format('Y-m-d'),
        ];
    }

    /** @return array<string, mixed> */
    public function sealedProduct(SealedProduct $product): array
    {
        return [
            'id' => $product->getId(),
            'tcgcsvProductId' => $product->getTcgcsvProductId(),
            'gameCode' => $product->getGame()?->getCode(),
            'gameName' => $product->getGame()?->getName(),
            'setId' => $product->getGameSet()?->getId(),
            'setName' => $product->getGameSet()?->getName(),
            'name' => $product->getName(),
            'imageUrl' => $product->getImageUrl(),
            'url' => $product->getUrl(),
            'marketPriceCents' => $product->getMarketPriceCents(),
            'lowPriceCents' => $product->getLowPriceCents(),
            'updatedAt' => $product->getUpdatedAt()->format(\DATE_ATOM),
        ];
    }

    /** @return array<string, mixed> */
    public function sealedInventoryItem(SealedInventoryItem $item): array
    {
        $product = $item->getSealedProduct();

        return [
            'id' => $item->getId(),
            'quantity' => $item->getQuantity(),
            'priceCents' => $item->getPriceCents(),
            'acquisitionCostCents' => $item->getAcquisitionCostCents(),
            'updatedAt' => $item->getUpdatedAt()->format(\DATE_ATOM),
            'product' => null !== $product ? $this->sealedProduct($product) : null,
        ];
    }

    /** @return array<string, mixed> */
    public function syncRun(CatalogSyncRun $run): array
    {
        return [
            'id' => $run->getId(),
            'gameCode' => $run->getGame()?->getCode(),
            'gameName' => $run->getGame()?->getName(),
            'status' => $run->getStatus(),
            'startedAt' => $run->getStartedAt()->format(\DATE_ATOM),
            'finishedAt' => $run->getFinishedAt()?->format(\DATE_ATOM),
            'summary' => $run->getSummary(),
            'error' => $run->getError(),
        ];
    }
}
