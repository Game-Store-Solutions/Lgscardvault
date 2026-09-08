<?php

namespace App\Tests\Controller;

use App\Entity\CustomerWantListEntry;
use App\Entity\StoreCustomer;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreWantListReportsTest extends WebTestCase
{
    private object $client;
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    public function testStoreAdminSeesMostWantedCards(): void
    {
        $store = $this->fixtures->store('want-analytics');
        $owner = $store->getOwner();
        self::assertInstanceOf(User::class, $owner);

        $shopperA = $this->fixtures->user(['ROLE_USER'], 'want-a@test.local');
        $shopperB = $this->fixtures->user(['ROLE_USER'], 'want-b@test.local');
        $customerA = (new StoreCustomer())->setStore($store)->setUser($shopperA);
        $customerB = (new StoreCustomer())->setStore($store)->setUser($shopperB);
        $this->em->persist($customerA);
        $this->em->persist($customerB);

        $this->em->persist(
            (new CustomerWantListEntry())
                ->setCustomer($customerA)
                ->setCardName('Sol Ring')
                ->setQuantity(2),
        );
        $this->em->persist(
            (new CustomerWantListEntry())
                ->setCustomer($customerB)
                ->setCardName('Sol Ring')
                ->setQuantity(1),
        );
        $this->em->persist(
            (new CustomerWantListEntry())
                ->setCustomer($customerA)
                ->setCardName('Lightning Bolt')
                ->setQuantity(1),
        );
        $this->em->flush();

        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($owner);
        $this->client->request(
            'GET',
            '/api/stores/want-analytics/reports/want-list',
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$token],
        );

        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        $payload = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertIsArray($payload);
        self::assertSame('want-analytics', $payload['storeSlug']);
        self::assertSame('Sol Ring', $payload['items'][0]['cardName']);
        self::assertSame(3, $payload['items'][0]['quantity']);
        self::assertSame(2, $payload['items'][0]['wanters']);
        self::assertSame('Lightning Bolt', $payload['items'][1]['cardName']);
    }

    public function testShopperCannotReadWantListAnalytics(): void
    {
        $shopper = $this->fixtures->user(['ROLE_USER'], 'nospy@test.local');
        $this->fixtures->store('want-private');
        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($shopper);

        $this->client->request(
            'GET',
            '/api/stores/want-private/reports/want-list',
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$token],
        );

        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }
}
