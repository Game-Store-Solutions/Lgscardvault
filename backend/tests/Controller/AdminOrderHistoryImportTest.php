<?php

namespace App\Tests\Controller;

use App\Entity\Order;
use App\Entity\User;
use App\Enum\OrderStatus;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class AdminOrderHistoryImportTest extends WebTestCase
{
    private object $client;
    private EntityManagerInterface $entityManager;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->entityManager = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->entityManager);
    }

    public function testPlatformAdminImportsLegacyOrdersAndLinksExistingUsers(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $store = $this->fixtures->store('legacy-import');
        $this->fixtures->user(['ROLE_USER'], 'robert@pullnplay.com');
        $this->fixtures->card(101, [
            'name' => 'Sowing Mycospawn',
            'set' => 'mh3',
            'image_uris' => [
                'small' => 'https://cards.example/small/sowing.jpg',
                'normal' => 'https://cards.example/normal/sowing.jpg',
            ],
        ]);
        $this->fixtures->card(102, [
            'name' => 'City of Brass',
            'set' => 'mh3',
            'image_uris' => [
                'small' => 'https://cards.example/small/city.jpg',
                'normal' => 'https://cards.example/normal/city.jpg',
            ],
        ]);

        $csv = <<<CSV
customerEmail,customerName,orderId,date,type,fulfillmentMethod,paymentStatus,status,itemCount,shippingCost,tax,total,refunded,netTotal,items,trackingNumber,shippingAddress
robert@pullnplay.com,Aaron,KSK-0658,2026-08-09,Kiosk,Pickup,Due at Pickup,Delivered,3,0.00,0.00,5.01,0.00,5.01,"2x Sowing Mycospawn (mh3) (Rare); 1x Desperate Ritual (chk) (Common)",,
ghost@example.com,Ghost,KSK-9999,2026-05-16,Online,Pickup,Due at Pickup,Delivered,1,0.00,0.00,4.18,0.00,4.18,1x Torbran Thane (eld) (Rare),,
robert@pullnplay.com,Aaron,KSK-0183,2026-05-16,Kiosk,Pickup,Due at Pickup,Cancelled,1,0.00,0.00,20.45,0.00,20.45,1x Pyretic Ritual (m11) (Common),,
CSV;

        $payload = $this->importAs($admin, $csv, ['storeSlug' => 'legacy-import']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        self::assertSame(3, $payload['imported']);
        self::assertSame(0, $payload['skipped']);
        self::assertSame(1, $payload['matchedUsers']);
        self::assertSame(2, $payload['matchedOrders']);
        self::assertGreaterThanOrEqual(1, $payload['cardsLinked']);
        self::assertFalse($payload['dryRun']);

        $this->entityManager->clear();
        $order = $this->entityManager->getRepository(Order::class)->findOneBy(['reference' => 'KSK-0658']);
        self::assertInstanceOf(Order::class, $order);
        self::assertSame(OrderStatus::COMPLETED, $order->getStatus());
        self::assertSame('robert@pullnplay.com', $order->getCustomerEmail());
        self::assertSame(501, $order->getTotalCents());
        self::assertSame(Order::CHANNEL_KIOSK, $order->getChannel());
        self::assertCount(2, $order->getLines());
        $firstLine = $order->getLines()->first();
        self::assertSame('Sowing Mycospawn (mh3)', $firstLine->getCardName());
        self::assertNotNull($firstLine->getCard());
        self::assertSame('Sowing Mycospawn', $firstLine->getCard()->getName());
        self::assertSame('https://cards.example/small/sowing.jpg', $firstLine->getCard()->getImageUris()['small'] ?? null);
        self::assertSame('2026-08-09', $order->getCreatedAt()->format('Y-m-d'));

        // Re-import skips duplicates.
        $again = $this->importAs($admin, $csv, ['storeSlug' => 'legacy-import']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame(0, $again['imported']);
        self::assertSame(3, $again['skipped']);

        // Empty items still imports with a placeholder line.
        $emptyItems = <<<CSV
customerEmail,customerName,orderId,date,type,fulfillmentMethod,paymentStatus,status,itemCount,shippingCost,tax,total,refunded,netTotal,items
empty@test.local,E,EMPTY-1,2026-03-01,Online,Pickup,Paid,Delivered,0,0,0,9.99,0,9.99,
CSV;
        $payload = $this->importAs($admin, $emptyItems, ['storeSlug' => 'legacy-import']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        self::assertSame(1, $payload['imported']);
        $emptyOrder = $this->entityManager->getRepository(Order::class)->findOneBy(['reference' => 'EMPTY-1']);
        self::assertInstanceOf(Order::class, $emptyOrder);
        self::assertSame(Order::CHANNEL_ONLINE, $emptyOrder->getChannel());
        self::assertSame(Order::FULFILLMENT_PICKUP, $emptyOrder->getFulfillment());
        self::assertSame('Imported order (line details unavailable)', $emptyOrder->getLines()->first()->getCardName());

        // Zero-quantity lines are skipped; names are cleaned of rarity fluff.
        $zeroQty = <<<CSV
customerEmail,customerName,orderId,date,type,fulfillmentMethod,paymentStatus,status,itemCount,shippingCost,tax,total,refunded,netTotal,items
zero@test.local,Z,ZERO-1,2026-08-15,Kiosk,Pickup,Due at Pickup,Delivered,1,0.00,0.00,12.23,0.00,12.23,"1x City of Brass (mh3) (Rare); 0x The Lonely Mountain (ltr) (Rare)"
CSV;
        $payload = $this->importAs($admin, $zeroQty, ['storeSlug' => 'legacy-import']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        $zeroOrder = $this->entityManager->getRepository(Order::class)->findOneBy(['reference' => 'ZERO-1']);
        self::assertInstanceOf(Order::class, $zeroOrder);
        self::assertSame(Order::CHANNEL_KIOSK, $zeroOrder->getChannel());
        self::assertCount(1, $zeroOrder->getLines());
        self::assertSame('City of Brass (mh3)', $zeroOrder->getLines()->first()->getCardName());
        self::assertSame(1223, $zeroOrder->getLines()->first()->getPriceCents());
        self::assertNotNull($zeroOrder->getLines()->first()->getCard());
    }

    public function testRelinkCardsEndpointLinksExistingLines(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $store = $this->fixtures->store('relink-orders');
        $this->fixtures->card(201, [
            'name' => 'Sol Ring',
            'set' => 'c21',
            'image_uris' => ['small' => 'https://cards.example/small/sol.jpg'],
        ]);

        $order = (new Order())
            ->setStore($store)
            ->setReference('REL-1')
            ->setStatus(OrderStatus::COMPLETED)
            ->setCustomerEmail('shopper@test.local')
            ->setTotalCents(100)
            ->setChannel(Order::CHANNEL_ONLINE)
            ->setFulfillment(Order::FULFILLMENT_PICKUP);
        $order->addLine(
            (new \App\Entity\OrderLine())
                ->setCardName('Sol Ring (c21)')
                ->setQuantity(1)
                ->setPriceCents(100),
        );
        $this->entityManager->persist($order);
        $this->entityManager->flush();

        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($admin);
        $this->client->request(
            'POST',
            '/api/admin/orders/relink-cards',
            server: [
                'HTTP_AUTHORIZATION' => 'Bearer '.$token,
                'CONTENT_TYPE' => 'application/json',
            ],
            content: json_encode(['storeSlug' => 'relink-orders'], JSON_THROW_ON_ERROR),
        );
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        $payload = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertSame(1, $payload['linked']);
        self::assertSame(0, $payload['unmatched']);

        $this->entityManager->clear();
        $reloaded = $this->entityManager->getRepository(Order::class)->findOneBy(['reference' => 'REL-1']);
        self::assertInstanceOf(Order::class, $reloaded);
        self::assertNotNull($reloaded->getLines()->first()->getCard());
        self::assertSame('Sol Ring', $reloaded->getLines()->first()->getCard()->getName());
    }

    public function testRelinkCleansLegacyRarityFluffBeforeMatching(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $store = $this->fixtures->store('relink-fluff');
        $this->fixtures->card(301, [
            'name' => 'Torbran, Thane of Red Fell',
            'set' => 'eld',
            'image_uris' => ['small' => 'https://cards.example/small/torbran.jpg'],
        ]);

        $order = (new Order())
            ->setStore($store)
            ->setReference('REL-FLUFF')
            ->setStatus(OrderStatus::COMPLETED)
            ->setCustomerEmail('shopper@test.local')
            ->setTotalCents(418)
            ->setChannel(Order::CHANNEL_KIOSK)
            ->setFulfillment(Order::FULFILLMENT_PICKUP);
        $order->addLine(
            (new \App\Entity\OrderLine())
                ->setCardName('Torbran, Thane of Red Fell (eld) (Rare) - Legendary')
                ->setQuantity(1)
                ->setPriceCents(418),
        );
        $this->entityManager->persist($order);
        $this->entityManager->flush();

        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($admin);
        $this->client->request(
            'POST',
            '/api/admin/orders/relink-cards',
            server: [
                'HTTP_AUTHORIZATION' => 'Bearer '.$token,
                'CONTENT_TYPE' => 'application/json',
            ],
            content: json_encode(['storeSlug' => 'relink-fluff'], JSON_THROW_ON_ERROR),
        );
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        $payload = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertSame(1, $payload['linked']);

        $this->entityManager->clear();
        $reloaded = $this->entityManager->getRepository(Order::class)->findOneBy(['reference' => 'REL-FLUFF']);
        self::assertInstanceOf(Order::class, $reloaded);
        $line = $reloaded->getLines()->first();
        self::assertNotNull($line->getCard());
        self::assertSame('Torbran, Thane of Red Fell (eld)', $line->getCardName());
    }

    public function testDryRunDoesNotPersist(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $this->fixtures->store('dry-orders');

        $csv = <<<CSV
customerEmail,customerName,orderId,date,type,fulfillmentMethod,paymentStatus,status,itemCount,shippingCost,tax,total,refunded,netTotal,items
a@test.local,A,DRY-1,2026-01-02,Online,Pickup,Paid,Delivered,1,0,0,1.00,0,1.00,1x Sol Ring (c21) (Uncommon)
CSV;

        $payload = $this->importAs($admin, $csv, ['storeSlug' => 'dry-orders', 'dryRun' => '1']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        self::assertTrue($payload['dryRun']);
        self::assertSame(1, $payload['imported']);
        self::assertNull($this->entityManager->getRepository(Order::class)->findOneBy(['reference' => 'DRY-1']));
    }

    /**
     * @param array<string, string> $fields
     *
     * @return array<string, mixed>
     */
    private function importAs(User $actor, string $csv, array $fields): array
    {
        $path = tempnam(sys_get_temp_dir(), 'ordimp').'.csv';
        file_put_contents($path, $csv);
        $upload = new UploadedFile($path, 'orders.csv', 'text/csv', test: true);
        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($actor);

        $this->client->request(
            'POST',
            '/api/admin/orders/import-history',
            parameters: $fields,
            files: ['file' => $upload],
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$token],
        );

        return json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];
    }
}
