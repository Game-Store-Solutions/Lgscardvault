<?php

namespace App\Service\Order;

use App\Entity\Order;
use App\Entity\OrderLine;

/** JSON shape for customer-facing order lists (store profile + global /me/orders). */
final class CustomerOrderSerializer
{
    /** @return array<string, mixed> */
    public function serialize(Order $order): array
    {
        return [
            'id' => $order->getId(),
            'reference' => $order->getReference(),
            'status' => $order->getStatus()->value,
            'storeName' => $order->getStore()?->getName(),
            'storeSlug' => $order->getStore()?->getSlug(),
            'customerName' => $order->getCustomerName(),
            'customerEmail' => $order->getCustomerEmail(),
            'fulfillment' => $order->getFulfillment(),
            'channel' => $order->getChannel(),
            'totalCents' => $order->getTotalCents(),
            'taxCents' => $order->getTaxCents(),
            'creditAppliedCents' => $order->getCreditAppliedCents(),
            'paidCents' => $order->getPaidCents(),
            'notes' => $order->getNotes(),
            'createdAt' => $order->getCreatedAt()->format(DATE_ATOM),
            'lines' => array_map($this->serializeLine(...), $order->getLines()->toArray()),
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
            'imageUris' => $line->getCard()?->getImageUris(),
            'setCode' => $line->getCard()?->getSetCode(),
            'collectorNumber' => $line->getCard()?->getCollectorNumber(),
            'caseName' => $line->getCaseName(),
            'sectionTitle' => $line->getSectionTitle(),
            'caseQuantity' => $line->getCaseQuantity(),
        ];
    }
}
