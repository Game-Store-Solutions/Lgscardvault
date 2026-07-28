<?php

namespace App\Service\CsvImport;

use App\Entity\CsvImportJob;
use App\Entity\CsvImportRow;
use App\Entity\SealedProduct;
use App\Entity\Store;
use App\Repository\SealedProductRepository;
use App\Service\Inventory\SealedInventoryService;

/**
 * Imports one claimed batch of sealed rows into a store's sealed inventory.
 * Rows resolve against the local sealed catalog only — sealed products come
 * from TCGCSV, so there is no remote fallback to make: an unmatched name
 * means the game's catalog needs a sync, which the row error says plainly.
 */
final readonly class SealedImportProcessor
{
    public function __construct(
        private SealedProductRepository $sealedProducts,
        private SealedInventoryService $sealedInventory,
    ) {
    }

    /**
     * @param list<CsvImportRow> $rows
     *
     * @return array{imported: int, failed: int}
     */
    public function processBatch(CsvImportJob $job, Store $store, array $rows): array
    {
        $game = $job->getGame();
        $imported = 0;
        $failed = 0;

        foreach ($rows as $row) {
            $row->setError(null);

            if (null === $game) {
                $this->fail($row, 'This import has no game assigned; re-upload it from the import wizard.');
                ++$failed;
                continue;
            }

            $productIdText = trim($row->getCollectorNumber());
            $product = $this->sealedProducts->findOneForImport(
                $game,
                $row->getName(),
                is_numeric($productIdText) ? (int) $productIdText : null,
                $row->getSetCode(),
            );

            if (!$product instanceof SealedProduct) {
                $this->fail($row, sprintf(
                    'No sealed product named "%s" in the %s catalog. Run a catalog sync for this game, or check the product name.',
                    $row->getName(),
                    $game->getName(),
                ));
                ++$failed;
                continue;
            }

            // The sheet's price wins; a blank price falls back to the
            // TCGplayer market snapshot inside the inventory service.
            $item = $this->sealedInventory->add(
                $store,
                $product,
                max(0, $row->getQuantity()),
                $row->getPriceCents(),
            );

            $row->setStatus(CsvImportRow::STATUS_IMPORTED);
            $row->setCard([
                'id' => $product->getId(),
                'name' => $product->getName(),
                'setName' => $product->getGameSet()?->getName(),
                'imageUrl' => $product->getImageUrl(),
                'sealed' => true,
            ]);
            $row->setImportedItemId($item->getId());
            ++$imported;
        }

        return ['imported' => $imported, 'failed' => $failed];
    }

    private function fail(CsvImportRow $row, string $error): void
    {
        $row->setStatus(CsvImportRow::STATUS_ERROR);
        $row->setError($error);
    }
}
