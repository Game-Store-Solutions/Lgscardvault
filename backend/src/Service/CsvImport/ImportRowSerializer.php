<?php

namespace App\Service\CsvImport;

use App\Entity\CsvImportRow;

/**
 * The wire shape of a CSV import row.
 *
 * Shared by the import controller and the failed-row recovery controller so
 * the two can never disagree about what a row looks like to the frontend.
 */
final class ImportRowSerializer
{
    /** @return array<string, mixed> */
    public function serialize(CsvImportRow $row): array
    {
        return [
            'rowIndex' => $row->getRowIndex(),
            'name' => $row->getName(),
            'game' => $row->getGame(),
            'set' => $row->getSetCode(),
            'condition' => $row->getCondition(),
            'finish' => $row->getFinish(),
            'isFoil' => $row->isFoil(),
            'rarity' => $row->getRarity(),
            'quantity' => $row->getQuantity(),
            'variant' => $row->getVariant(),
            'collectorNumber' => $row->getCollectorNumber(),
            'status' => $row->getStatus(),
            'card' => $row->getCard(),
            'error' => $row->getError(),
            'importedItemId' => $row->getImportedItemId(),
            'priceCents' => $row->getPriceCents(),
        ];
    }
}
