<?php

namespace App\Tests\Controller;

use App\Entity\Order;
use App\Enum\OrderStatus;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreOrderDayTotalsTest extends WebTestCase
{
    public function testOpenCountIncludesTodayAndYesterdayBuckets(): void
    {
        $client = static::createClient();
        $c = static::getContainer();
        /** @var EntityManagerInterface $em */
        $em = $c->get('doctrine')->getManager();
        $fixtures = new CatalogFixtures($em);
        $store = $fixtures->store('day-totals-store');
        $bearer = $c->get(JWTTokenManagerInterface::class)->create($store->getOwner());

        $tz = new \DateTimeZone('America/Los_Angeles');
        $todayStart = (new \DateTimeImmutable('today', $tz))->setTimezone(new \DateTimeZone('UTC'));
        $yesterdayStart = $todayStart->modify('-1 day');

        $todayPending = (new Order())
            ->setStore($store)
            ->setReference('DAY-TODAY-P')
            ->setChannel(Order::CHANNEL_ONLINE)
            ->setStatus(OrderStatus::PENDING)
            ->setFulfillment(Order::FULFILLMENT_PICKUP)
            ->setCustomerName('Today Pending')
            ->setCreatedAt($todayStart->modify('+1 hour'));
        $todayDone = (new Order())
            ->setStore($store)
            ->setReference('DAY-TODAY-C')
            ->setChannel(Order::CHANNEL_KIOSK)
            ->setStatus(OrderStatus::COMPLETED)
            ->setFulfillment(Order::FULFILLMENT_PICKUP)
            ->setCustomerName('Today Done')
            ->setCreatedAt($todayStart->modify('+2 hour'));
        $yesterdayCancel = (new Order())
            ->setStore($store)
            ->setReference('DAY-YDAY-X')
            ->setChannel(Order::CHANNEL_ONLINE)
            ->setStatus(OrderStatus::CANCELLED)
            ->setFulfillment(Order::FULFILLMENT_PICKUP)
            ->setCustomerName('Yesterday Cancel')
            ->setCreatedAt($yesterdayStart->modify('+3 hour'));

        $em->persist($todayPending);
        $em->persist($todayDone);
        $em->persist($yesterdayCancel);
        $em->flush();

        $client->request(
            'GET',
            sprintf('/api/stores/%s/orders-open-count?tz=America/Los_Angeles', $store->getSlug()),
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$bearer],
        );

        self::assertResponseIsSuccessful();
        $payload = json_decode((string) $client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);

        self::assertSame(2, $payload['today']['new']);
        self::assertSame(1, $payload['today']['pending']);
        self::assertSame(1, $payload['today']['completed']);
        self::assertSame(0, $payload['today']['canceled']);
        self::assertSame(1, $payload['yesterday']['new']);
        self::assertSame(1, $payload['yesterday']['canceled']);
    }
}
