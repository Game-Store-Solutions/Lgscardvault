<?php

namespace App\Enum;

/**
 * Admin Orders list tabs — maps to order status sets for server-side pagination.
 */
enum AdminOrderQueue: string
{
    case Pending = 'pending';
    case Processing = 'processing';
    case Delivery = 'delivery';
    case Ready = 'ready';
    case Delivered = 'delivered';

    /** @return list<OrderStatus>|null null = all orders (no status filter) */
    public function statuses(): ?array
    {
        return match ($this) {
            self::Pending => [OrderStatus::PENDING],
            self::Processing => [OrderStatus::RECEIVED, OrderStatus::PAID],
            self::Delivery => [OrderStatus::SHIPPED],
            self::Ready => [OrderStatus::FULFILLED],
            self::Delivered => [OrderStatus::COMPLETED],
        };
    }

    public static function tryFromFilter(?string $value): ?self
    {
        if (null === $value || '' === $value || 'all' === $value) {
            return null;
        }

        return self::tryFrom($value);
    }
}
