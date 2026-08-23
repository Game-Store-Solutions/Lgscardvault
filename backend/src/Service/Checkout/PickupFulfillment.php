<?php

namespace App\Service\Checkout;

use App\Entity\Order;
use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * Launch fulfillment is pickup only. Shipping remains in the schema for
 * historical orders but is rejected on every new checkout path.
 */
final class PickupFulfillment
{
    public const SHOPPER_MESSAGE = 'Shipping is not available. Orders are pickup only.';

    /**
     * @return Order::FULFILLMENT_PICKUP|JsonResponse
     */
    public static function resolve(mixed $value): string|JsonResponse
    {
        $fulfillment = is_string($value) && '' !== trim($value) ? trim($value) : Order::FULFILLMENT_PICKUP;
        if (Order::FULFILLMENT_PICKUP === $fulfillment) {
            return Order::FULFILLMENT_PICKUP;
        }

        $detail = Order::FULFILLMENT_SHIPPING === $fulfillment
            ? self::SHOPPER_MESSAGE
            : sprintf('Unknown fulfillment method. Orders are pickup only.');

        return new JsonResponse(['detail' => $detail], 422);
    }
}
