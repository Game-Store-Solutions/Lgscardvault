<?php

namespace App\Tests\Service\Payments;

use App\Service\Payments\SquareInvoiceMinimum;
use PHPUnit\Framework\TestCase;

final class SquareInvoiceMinimumTest extends TestCase
{
    public function testDoesNotPadAtOrAboveOneDollar(): void
    {
        $lines = [['name' => 'Card', 'quantity' => 1, 'priceCents' => 100]];

        self::assertSame($lines, SquareInvoiceMinimum::invoiceLineItems($lines, 8, 108));
        self::assertSame($lines, SquareInvoiceMinimum::padLineItems($lines, 100));
        self::assertFalse(SquareInvoiceMinimum::needsPad(100));
    }

    public function testPadsSubDollarDueWithoutTaxingThePad(): void
    {
        $lines = [['name' => 'Card', 'quantity' => 1, 'priceCents' => 15]];
        $padded = SquareInvoiceMinimum::invoiceLineItems($lines, 2, 17);

        self::assertCount(3, $padded);
        self::assertSame('Card', $padded[0]['name']);
        self::assertSame(SquareInvoiceMinimum::TAX_LINE_NAME, $padded[1]['name']);
        self::assertSame(2, $padded[1]['priceCents']);
        self::assertSame(SquareInvoiceMinimum::PAD_LINE_NAME, $padded[2]['name']);
        self::assertSame(83, $padded[2]['priceCents']);
    }

    public function testPadWithoutTaxIsOnlyTheBufferLine(): void
    {
        $lines = [['name' => 'Card', 'quantity' => 1, 'priceCents' => 15]];
        $padded = SquareInvoiceMinimum::invoiceLineItems($lines, 0, 15);

        self::assertCount(2, $padded);
        self::assertSame(SquareInvoiceMinimum::PAD_LINE_NAME, $padded[1]['name']);
        self::assertSame(85, $padded[1]['priceCents']);
    }
}
