<?php

namespace App\Service\Checkout;

use App\Entity\CartItem;

final class CartQuoteLines
{
    /**
     * Preview line items at current listing prices without consuming stock.
     *
     * @param list<CartItem> $cartItems
     *
     * @return array{subtotalCents: int, lineItems: list<array{name: string, quantity: int, priceCents: int}>}
     */
    public static function fromCartItems(array $cartItems): array
    {
        $lineItems = [];
        $subtotalCents = 0;
        foreach ($cartItems as $cartItem) {
            if ($cartItem->isSealed()) {
                $sealed = $cartItem->getSealedInventoryItem();
                if (null === $sealed || $sealed->getQuantity() < 1) {
                    continue;
                }
                $quantity = min($cartItem->getQuantity(), $sealed->getQuantity());
                $price = $sealed->getPriceCents();
                $name = $sealed->getSealedProduct()?->getName() ?? 'Sealed product';
            } else {
                $item = $cartItem->getInventoryItem();
                if (null === $item || $item->getQuantity() < 1) {
                    continue;
                }
                $quantity = min($cartItem->getQuantity(), $item->getQuantity());
                $price = $item->getPriceCents();
                $name = $item->getCard()?->getName() ?? 'Unknown card';
            }
            $lineItems[] = [
                'name' => $name,
                'quantity' => $quantity,
                'priceCents' => $price,
            ];
            $subtotalCents += $quantity * $price;
        }

        return [
            'subtotalCents' => $subtotalCents,
            'lineItems' => $lineItems,
        ];
    }
}
