<?php

namespace App\Enum;

enum OrderStatus: string
{
    case PENDING = 'pending';
    case RECEIVED = 'received';
    case FULFILLED = 'fulfilled';
    case PAID = 'paid';
    case SHIPPED = 'shipped';
    case COMPLETED = 'completed';
    case CANCELLED = 'cancelled';
    case REFUNDED = 'refunded';

    /**
     * The order-status state machine. Transitions not listed here are
     * rejected by StoreOrderStatusProcessor, so the rules live server-side
     * (the admin UI mirrors them, but is not the source of truth).
     *
     * @return list<self>
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::PENDING => [self::RECEIVED, self::PAID, self::CANCELLED],
            self::RECEIVED => [self::FULFILLED, self::PAID, self::SHIPPED, self::CANCELLED, self::REFUNDED],
            self::PAID => [self::RECEIVED, self::FULFILLED, self::SHIPPED, self::CANCELLED, self::REFUNDED],
            self::SHIPPED => [self::FULFILLED, self::COMPLETED, self::REFUNDED],
            self::FULFILLED, self::COMPLETED => [self::REFUNDED],
            self::CANCELLED, self::REFUNDED => [],
        };
    }

    public function canTransitionTo(self $next): bool
    {
        return in_array($next, $this->allowedTransitions(), true);
    }

    /** Statuses whose stock should be returned to inventory. */
    public function returnsStock(): bool
    {
        return self::CANCELLED === $this || self::REFUNDED === $this;
    }

    /** Statuses that mean the customer's cards are ready / handed over. */
    public function isFulfilled(): bool
    {
        return self::FULFILLED === $this || self::COMPLETED === $this;
    }

    /** Admin sidebar badge — in-progress orders; fulfilled/cancelled/refunded are excluded. */
    public function isOpenForStoreBadge(): bool
    {
        return !$this->isFulfilled()
            && self::CANCELLED !== $this
            && self::REFUNDED !== $this;
    }
}
