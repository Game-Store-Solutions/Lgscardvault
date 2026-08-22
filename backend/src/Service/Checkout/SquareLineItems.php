<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use App\Entity\OrderLine;

final class SquareLineItems
{
    /**
     * @return list<array{name: string, quantity: int, priceCents: int}>
     */
    public static function fromOrder(Order $order): array
    {
        $items = [];
        foreach ($order->getLines() as $line) {
            if (!$line instanceof OrderLine) {
                continue;
            }
            $items[] = [
                'name' => $line->getCardName(),
                'quantity' => $line->getQuantity(),
                'priceCents' => $line->getPriceCents(),
            ];
        }

        return $items;
    }
}
