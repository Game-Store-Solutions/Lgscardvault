<?php

namespace App\Service\Store;

use App\Entity\Store;

/**
 * Resolves a store's effective sell/trade payout rates at a point in time.
 *
 * Stores configure rates as percentages of market price (Store::$tradeRates):
 * base credit/cash rates, optional premium rates for buy-list cards, and an
 * optional promo window that temporarily overrides the base rates. Buy-list
 * rates never resolve below the regular rate — "premium" must not pay less.
 */
final readonly class TradeRateResolver
{
    public const DEFAULT_CREDIT_PERCENT = 60;
    public const DEFAULT_CASH_PERCENT = 45;

    /**
     * @return array{
     *     creditPercent: int,
     *     cashPercent: int,
     *     buylistCreditPercent: int,
     *     buylistCashPercent: int,
     *     promoActive: bool,
     *     promoEndsAt: ?string,
     * }
     */
    public function resolve(Store $store, ?\DateTimeImmutable $now = null): array
    {
        $now ??= new \DateTimeImmutable();
        $rates = $store->getTradeRates() ?? [];

        $credit = $this->percent($rates['creditRatePercent'] ?? null, self::DEFAULT_CREDIT_PERCENT);
        $cash = $this->percent($rates['cashRatePercent'] ?? null, self::DEFAULT_CASH_PERCENT);

        $promoStartsAt = $this->date($rates['promoStartsAt'] ?? null);
        $promoEndsAt = $this->date($rates['promoEndsAt'] ?? null);
        $promoActive = null !== $promoStartsAt && null !== $promoEndsAt && $now >= $promoStartsAt && $now <= $promoEndsAt;
        if ($promoActive) {
            $credit = $this->percent($rates['promoCreditRatePercent'] ?? null, $credit);
            $cash = $this->percent($rates['promoCashRatePercent'] ?? null, $cash);
        }

        return [
            'creditPercent' => $credit,
            'cashPercent' => $cash,
            'buylistCreditPercent' => max($credit, $this->percent($rates['buylistCreditRatePercent'] ?? null, $credit)),
            'buylistCashPercent' => max($cash, $this->percent($rates['buylistCashRatePercent'] ?? null, $cash)),
            'promoActive' => $promoActive,
            'promoEndsAt' => $promoActive ? $promoEndsAt?->format(DATE_ATOM) : null,
        ];
    }

    /** Per-copy payout for a market price at a percentage rate, rounded down to whole cents. */
    public function offerCents(int $marketCents, int $percent): int
    {
        return intdiv(max(0, $marketCents) * max(0, $percent), 100);
    }

    private function percent(mixed $value, int $fallback): int
    {
        if (!is_numeric($value)) {
            return $fallback;
        }
        $percent = (int) $value;

        return ($percent >= 0 && $percent <= 100) ? $percent : $fallback;
    }

    private function date(mixed $value): ?\DateTimeImmutable
    {
        if (!is_string($value) || '' === trim($value)) {
            return null;
        }
        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception) {
            return null;
        }
    }
}
