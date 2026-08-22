<?php

namespace App\Tests\Service;

use App\Entity\Store;
use App\Service\Compliance\StoreComplianceGate;
use PHPUnit\Framework\TestCase;

final class StoreComplianceGateTest extends TestCase
{
    public function testCaliforniaRequiresPermit(): void
    {
        $store = $this->store('CA', [
            'legalBusinessName' => 'Bay Cards LLC',
            'entityType' => 'llc',
            'insuranceAttested' => true,
        ]);

        self::assertNotEmpty(StoreComplianceGate::errors($store));

        $store->setCompliance(StoreComplianceGate::normalize([
            'legalBusinessName' => 'Bay Cards LLC',
            'entityType' => 'llc',
            'sellerPermitNumber' => 'SR-99',
            'insuranceAttested' => true,
        ]));
        self::assertSame([], StoreComplianceGate::errors($store));
    }

    public function testOregonRequiresNoTaxAttestation(): void
    {
        $store = $this->store('OR', [
            'legalBusinessName' => 'Portland Cards',
            'entityType' => 'sole_prop',
            'insuranceAttested' => true,
        ]);
        self::assertNotEmpty(StoreComplianceGate::errors($store));

        $store->setCompliance(StoreComplianceGate::normalize([
            'legalBusinessName' => 'Portland Cards',
            'entityType' => 'sole_prop',
            'noStateSalesTax' => true,
            'insuranceAttested' => true,
        ]));
        self::assertSame([], StoreComplianceGate::errors($store));
    }

    public function testBuyTradeRequiresSecondhandStatus(): void
    {
        $store = $this->store('TX', [
            'legalBusinessName' => 'Austin TCG',
            'entityType' => 'llc',
            'sellerPermitNumber' => '1',
            'insuranceAttested' => true,
            'usesBuyTrade' => true,
        ]);
        self::assertNotEmpty(StoreComplianceGate::errors($store));
    }

    /** @param array<string, mixed> $compliance */
    private function store(string $region, array $compliance): Store
    {
        return (new Store())
            ->setName('Shop')
            ->setSlug('shop-'.bin2hex(random_bytes(2)))
            ->setRegion($region)
            ->setCompliance(StoreComplianceGate::normalize($compliance));
    }
}
