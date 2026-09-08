<?php

namespace App\Tests\Service;

use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Service\Checkout\PickupOrderTaxSync;
use App\Tests\Support\FakeCheckoutGateway;
use PHPUnit\Framework\TestCase;

final class PickupOrderTaxSyncTest extends TestCase
{
    public function testSyncWritesQuotedTaxOntoUnpaidOrder(): void
    {
        $gateway = new FakeCheckoutGateway();
        $gateway->addedTaxCents = 42;
        $sync = new PickupOrderTaxSync($gateway);

        $store = (new Store())->setName('Tax Store')->setSlug('tax-store');
        $order = (new Order())
            ->setStore($store)
            ->setReference('KSK-TEST')
            ->setChannel(Order::CHANNEL_KIOSK)
            ->setTotalCents(1000);
        $order->addLine((new OrderLine())->setCardName('Sol Ring')->setQuantity(1)->setPriceCents(1000));

        self::assertSame(42, $sync->sync($store, $order));
        self::assertSame(42, $order->getTaxCents());
    }

    public function testCapturedOnlineTaxStaysLocked(): void
    {
        $gateway = new FakeCheckoutGateway();
        $gateway->addedTaxCents = 99;
        $sync = new PickupOrderTaxSync($gateway);

        $store = (new Store())->setName('Tax Store')->setSlug('tax-store');
        $order = (new Order())
            ->setStore($store)
            ->setReference('ORD-PAID')
            ->setChannel(Order::CHANNEL_ONLINE)
            ->setTotalCents(1000)
            ->setTaxCents(80)
            ->setPaidCents(1080)
            ->setPaymentProvider(StorePaymentAccount::PROVIDER_SQUARE);
        $order->addLine((new OrderLine())->setCardName('Sol Ring')->setQuantity(1)->setPriceCents(1000));

        self::assertSame(80, $sync->sync($store, $order));
        self::assertSame(80, $order->getTaxCents());
        self::assertSame([], $gateway->quotes);
    }
}
