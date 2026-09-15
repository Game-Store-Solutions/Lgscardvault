<?php

namespace App\Service\Order;

use App\Entity\Order;
use App\Entity\OrderLine;

/** Staff JSON for a store order — scalars only, never the entity graph. */
final class StoreOrderReadSerializer
{
    /** @return array<string, mixed> */
    public function serialize(Order $order): array
    {
        return [
            'id' => $order->getId(),
            'reference' => $order->getReference(),
            'status' => $order->getStatus()->value,
            'customerName' => $order->getCustomerName(),
            'customerEmail' => $order->getCustomerEmail(),
            'fulfillment' => $order->getFulfillment(),
            'channel' => $order->getChannel(),
            'totalCents' => $order->getTotalCents(),
            'taxCents' => $order->getTaxCents(),
            'creditAppliedCents' => $order->getCreditAppliedCents(),
            'paidCents' => $order->getPaidCents(),
            'balanceDueCents' => $order->getBalanceDueCents(),
            'creditOwedCents' => $order->getCreditOwedCents(),
            'paymentProvider' => $order->getPaymentProvider(),
            'paymentCaptures' => $order->getPaymentCaptures(),
            'notes' => $order->getNotes(),
            'disputeStatus' => $order->getDisputeStatus(),
            'disputeReason' => $order->getDisputeReason(),
            'disputedAt' => $order->getDisputedAt()?->format(DATE_ATOM),
            'squareOrderId' => $order->getSquareOrderId(),
            'squareInvoiceId' => $order->getSquareInvoiceId(),
            'squareInvoiceUrl' => $order->getSquareInvoiceUrl(),
            'createdAt' => $order->getCreatedAt()->format(DATE_ATOM),
            'statusChangedAt' => $order->getStatusChangedAt()?->format(DATE_ATOM),
            'lines' => array_values(array_map(
                $this->serializeLine(...),
                $order->getLines()->toArray(),
            )),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeLine(OrderLine $line): array
    {
        return [
            'id' => $line->getId(),
            'cardName' => $line->getCardName(),
            'quantity' => $line->getQuantity(),
            'priceCents' => $line->getPriceCents(),
            'acquisitionCostCents' => $line->getAcquisitionCostCents(),
            'caseName' => $line->getCaseName(),
            'sectionTitle' => $line->getSectionTitle(),
            'caseQuantity' => $line->getCaseQuantity(),
            'imageUris' => $line->getImageUris(),
            'setCode' => $line->getSetCode(),
            'setName' => $line->getSetName(),
            'collectorNumber' => $line->getCollectorNumber(),
            'rarity' => $line->getRarity(),
            'finish' => $line->getFinish(),
            'condition' => $line->getCondition(),
            'printingTags' => $line->getPrintingTags(),
            'isSealed' => $line->isSealed(),
        ];
    }
}
