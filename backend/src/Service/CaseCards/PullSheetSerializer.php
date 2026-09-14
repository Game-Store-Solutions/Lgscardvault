<?php

namespace App\Service\CaseCards;

use App\Entity\OrderLine;
use App\Entity\StoreSection;

/** JSON for section and store-wide pull sheets. */
final class PullSheetSerializer
{
    public const SCOPE_SECTION = 'section';
    public const SCOPE_STORE = 'store';

    /**
     * @param list<OrderLine> $lines
     *
     * @return array<string, mixed>
     */
    public function forSection(StoreSection $section, array $lines): array
    {
        return $this->sheet(
            $lines,
            self::SCOPE_SECTION,
            $section->getTitle(),
            $section->getStoreCase()?->getName(),
        );
    }

    /**
     * @param list<OrderLine> $lines
     *
     * @return array<string, mixed>
     */
    public function forStore(array $lines): array
    {
        return $this->sheet($lines, self::SCOPE_STORE, 'All cases', null);
    }

    /**
     * @param list<OrderLine> $lines
     *
     * @return array<string, mixed>
     */
    private function sheet(array $lines, string $scope, string $sectionTitle, ?string $caseName): array
    {
        $rows = [];
        $totalCards = 0;
        foreach ($lines as $line) {
            $row = $this->row($line);
            $totalCards += $row['quantity'];
            $rows[] = $row;
        }

        return [
            'scope' => $scope,
            'caseName' => $caseName,
            'sectionTitle' => $sectionTitle,
            'generatedAt' => (new \DateTimeImmutable())->format(DATE_ATOM),
            'totalCards' => $totalCards,
            'rows' => $rows,
        ];
    }

    /** @return array<string, mixed> */
    private function row(OrderLine $line): array
    {
        $order = $line->getParentOrder();
        $card = $line->getCard();
        $section = $line->getSectionCard()?->getSection();

        return [
            'lineId' => $line->getId(),
            'cardName' => $line->getCardName(),
            'setCode' => $card?->getSetCode(),
            'collectorNumber' => $card?->getCollectorNumber(),
            'quantity' => $line->getCaseQuantity(),
            'caseName' => $line->getCaseName() ?? $section?->getStoreCase()?->getName(),
            'sectionTitle' => $line->getSectionTitle() ?? $section?->getTitle(),
            'orderReference' => $order?->getReference(),
            'orderStatus' => $order?->getStatus()->value,
            'customerName' => $order?->getCustomerName(),
            'customerEmail' => $order?->getCustomerEmail(),
            'orderedAt' => $order?->getCreatedAt()->format(DATE_ATOM),
        ];
    }
}
