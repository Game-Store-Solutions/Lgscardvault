<?php

namespace App\Tests\Service\Store;

use App\Service\Store\StoreFeatureCatalog;
use PHPUnit\Framework\TestCase;

final class StoreFeatureCatalogTest extends TestCase
{
    public function testMissingKeysDefaultOn(): void
    {
        self::assertTrue(StoreFeatureCatalog::resolve([])['events']);
        self::assertFalse(StoreFeatureCatalog::resolve(['events' => false])['events']);
        self::assertTrue(StoreFeatureCatalog::resolve(['events' => false])['sealed']);
    }

    public function testUnknownPayloadKeysAreRejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        StoreFeatureCatalog::patchFromPayload(['nope' => false]);
    }

    public function testPartialPatchKeepsOnlyProvidedKeys(): void
    {
        self::assertSame(['sellTrade' => false], StoreFeatureCatalog::patchFromPayload(['sellTrade' => false]));
    }
}
