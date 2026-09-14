<?php

namespace App\Service\Payments;

/**
 * Square US invoices and payment links reject totals under $1.00.
 * Sub-dollar holds get a staff-deleted pad line so the invoice can publish.
 * Tax is added as a fixed line so the pad is not percentage-taxed.
 */
final class SquareInvoiceMinimum
{
    public const MIN_CENTS = 100;

    public const PAD_LINE_NAME = 'DELETE THIS — Square $1 minimum (do not charge)';

    public const TAX_LINE_NAME = 'Sales tax';

    /**
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return list<array{name: string, quantity: int, priceCents: int}>
     */
    public static function padLineItems(array $lineItems, int $amountDueCents): array
    {
        if (!self::needsPad($amountDueCents)) {
            return $lineItems;
        }

        $lineItems[] = [
            'name' => self::PAD_LINE_NAME,
            'quantity' => 1,
            'priceCents' => self::MIN_CENTS - $amountDueCents,
        ];

        return $lineItems;
    }

    /**
     * Square invoice/payment-link lines for a sub-$1 hold: merch, then tax as a
     * line (so the pad is not taxed), then the staff-deleted pad to $1.00.
     *
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return list<array{name: string, quantity: int, priceCents: int}>
     */
    public static function invoiceLineItems(array $lineItems, int $taxCents, int $dueCents): array
    {
        if (!self::needsPad($dueCents)) {
            return $lineItems;
        }

        $lines = $lineItems;
        if ($taxCents > 0) {
            $lines[] = [
                'name' => self::TAX_LINE_NAME,
                'quantity' => 1,
                'priceCents' => $taxCents,
            ];
        }

        return self::padLineItems($lines, $dueCents);
    }

    public static function needsPad(int $amountDueCents): bool
    {
        return $amountDueCents > 0 && $amountDueCents < self::MIN_CENTS;
    }
}
