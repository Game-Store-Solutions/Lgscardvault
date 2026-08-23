<?php

namespace App\Tests\Service;

use App\Entity\Store;
use App\Service\Checkout\PickupTaxPolicy;
use PHPUnit\Framework\TestCase;

final class PickupTaxPolicyTest extends TestCase
{
    public function testUnknownRegionDoesNotBlockZeroTax(): void
    {
        $store = (new Store())->setName('X')->setSlug('x');
        $policy = new PickupTaxPolicy();

        self::assertNull($policy->cardCheckoutBlockReason($store, 0, 1000));
        $quote = $policy->decorateQuote($store, 1000, 0, ['taxCents' => 0, 'dueCents' => 1000]);
        self::assertTrue($quote['taxReady']);
        self::assertNull($quote['taxBlockReason']);
    }

    /**
     * @dataProvider noStateSalesTaxRegions
     */
    public function testNoSalesTaxStateAllowsZeroTaxAndMarksQuoteReady(string $region): void
    {
        $store = (new Store())->setName('X')->setSlug('x')->setRegion($region);
        $policy = new PickupTaxPolicy();

        self::assertNull($policy->cardCheckoutBlockReason($store, 0, 2500));
        $quote = $policy->decorateQuote($store, 2500, 0, ['taxCents' => 0, 'dueCents' => 2500]);
        self::assertTrue($quote['taxReady']);
        self::assertNull($quote['taxBlockReason']);
        self::assertStringContainsString('no statewide sales tax', strtolower($quote['taxNote']));
    }

    /** @return array<string, array{string}> */
    public static function noStateSalesTaxRegions(): array
    {
        return [
            'AK' => ['AK'],
            'Alaska' => ['Alaska'],
            'DE' => ['DE'],
            'Delaware' => ['Delaware'],
            'MT' => ['MT'],
            'NH' => ['NH'],
            'OR' => ['OR'],
            'Oregon' => ['Oregon'],
        ];
    }

    public function testCaliforniaBlocksZeroTax(): void
    {
        $store = (new Store())->setName('X')->setSlug('x')->setRegion('CA');
        $policy = new PickupTaxPolicy();

        $reason = $policy->cardCheckoutBlockReason($store, 0, 2500);
        self::assertSame(PickupTaxPolicy::BLOCK_MESSAGE, $reason);

        $quote = $policy->decorateQuote($store, 2500, 0, ['taxCents' => 0, 'dueCents' => 2500]);
        self::assertFalse($quote['taxReady']);
        self::assertSame(PickupTaxPolicy::BLOCK_MESSAGE, $quote['taxBlockReason']);
    }

    public function testCaliforniaAllowsWhenTaxQuoted(): void
    {
        $store = (new Store())->setName('X')->setSlug('x')->setRegion('California');
        $policy = new PickupTaxPolicy();

        self::assertNull($policy->cardCheckoutBlockReason($store, 187, 2500));
    }

    public function testZeroMerchandiseIsNotBlocked(): void
    {
        $store = (new Store())->setName('X')->setSlug('x')->setRegion('CA');
        $policy = new PickupTaxPolicy();

        self::assertNull($policy->cardCheckoutBlockReason($store, 0, 0));
    }

    public function testCaliforniaBlocksZeroTaxWhenCreditCoversMerchandise(): void
    {
        $store = (new Store())->setName('X')->setSlug('x')->setRegion('CA');
        $policy = new PickupTaxPolicy();

        self::assertSame(PickupTaxPolicy::BLOCK_MESSAGE, $policy->cardCheckoutBlockReason($store, 0, 2500));
        $quote = $policy->decorateQuote($store, 2500, 2500, ['taxCents' => 0, 'dueCents' => 0]);
        self::assertFalse($quote['taxReady']);
        self::assertSame(PickupTaxPolicy::BLOCK_MESSAGE, $quote['taxBlockReason']);
    }
}
