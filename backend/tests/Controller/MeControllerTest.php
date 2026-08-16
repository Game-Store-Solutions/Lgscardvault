<?php

namespace App\Tests\Controller;

use App\Entity\CustomerNotification;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Self-service account management: profile updates, password changes, and
 * account deletion — all scoped strictly to the authenticated user.
 */
final class MeControllerTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    private function jsonRequest(string $method, string $url, ?array $body = null): array
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }

        $this->client->request($method, $url, server: $server, content: null === $body ? '' : json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    private function setKnownPassword(User $user, string $password): void
    {
        $hasher = static::getContainer()->get(UserPasswordHasherInterface::class);
        $user->setPassword($hasher->hashPassword($user, $password));
        $this->em->flush();
    }

    public function testProfileUpdateAndAvatar(): void
    {
        $user = $this->fixtures->user(['ROLE_USER']);
        $this->authenticate($user);

        $body = $this->jsonRequest('PATCH', '/api/me', [
            'displayName' => 'New Name',
            'avatarUrl' => 'https://cdn.example/me.png',
        ]);
        self::assertResponseIsSuccessful();
        self::assertSame('New Name', $body['displayName']);
        self::assertSame('https://cdn.example/me.png', $body['avatarUrl']);

        // Clearing the avatar and rejecting junk URLs.
        $body = $this->jsonRequest('PATCH', '/api/me', ['avatarUrl' => '']);
        self::assertNull($body['avatarUrl']);
        $this->jsonRequest('PATCH', '/api/me', ['avatarUrl' => 'javascript:alert(1)']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
    }

    public function testPasswordChangeRequiresCurrentPassword(): void
    {
        $user = $this->fixtures->user(['ROLE_USER']);
        $this->setKnownPassword($user, 'old-password');
        $this->authenticate($user);

        $this->jsonRequest('POST', '/api/me/password', ['currentPassword' => 'wrong', 'newPassword' => 'brand-new-pass']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', '/api/me/password', ['currentPassword' => 'old-password', 'newPassword' => 'short']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', '/api/me/password', ['currentPassword' => 'old-password', 'newPassword' => 'brand-new-pass']);
        self::assertResponseIsSuccessful();
    }

    public function testDeleteAccountBlocksStoreOwnersAndDeletesCustomers(): void
    {
        // Store owners must divest first.
        $store = $this->fixtures->store();
        $owner = $store->getOwner();
        $this->setKnownPassword($owner, 'owner-pass');
        $this->authenticate($owner);
        $this->jsonRequest('DELETE', '/api/me', ['password' => 'owner-pass']);
        self::assertSame(409, $this->client->getResponse()->getStatusCode());

        // A plain customer deletes cleanly (wrong password rejected first).
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->setKnownPassword($customer, 'customer-pass');
        $customerId = $customer->getId();
        $this->authenticate($customer);

        $this->jsonRequest('DELETE', '/api/me', ['password' => 'nope']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('DELETE', '/api/me', ['password' => 'customer-pass']);
        self::assertSame(204, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        self::assertNull($this->em->getRepository(User::class)->find($customerId));
    }

    public function testMyStoresListsEveryStoreWithActivity(): void
    {
        $storeA = $this->fixtures->store();
        $storeB = $this->fixtures->store();
        $quiet = $this->fixtures->store();
        $customer = $this->fixtures->user(['ROLE_USER']);

        // Saved profile at store A; a sell submission at store B; nothing at the third.
        $profile = (new \App\Entity\StoreCustomer())->setUser($customer)->setStore($storeA);
        $submission = (new \App\Entity\SellSubmission())->setStore($storeB)->setUser($customer);
        $this->em->persist($profile);
        $this->em->persist($submission);
        $this->em->flush();

        $this->authenticate($customer);
        $stores = $this->jsonRequest('GET', '/api/me/stores');

        $slugs = array_column($stores, 'slug');
        self::assertContains($storeA->getSlug(), $slugs);
        self::assertContains($storeB->getSlug(), $slugs);
        self::assertNotContains($quiet->getSlug(), $slugs, 'stores without any activity stay out of the list');

        $bySlug = array_column($stores, null, 'slug');
        self::assertSame(1, $bySlug[$storeB->getSlug()]['submissionCount']);
        self::assertSame(0, $bySlug[$storeB->getSlug()]['orderCount']);
    }

    public function testMyOrdersListsEveryStoreOrderForAccountEmail(): void
    {
        $storeA = $this->fixtures->store();
        $storeB = $this->fixtures->store();
        $customer = $this->fixtures->user(['ROLE_USER']);

        foreach ([$storeA, $storeB] as $i => $store) {
            $order = (new \App\Entity\Order())
                ->setStore($store)
                ->setCustomerEmail($customer->getEmail())
                ->setCustomerName('Buyer')
                ->setReference('ORD-TEST-'.$i)
                ->setStatus(\App\Enum\OrderStatus::PENDING)
                ->setTotalCents(1000)
                ->setFulfillment(\App\Entity\Order::FULFILLMENT_PICKUP)
                ->setChannel(\App\Entity\Order::CHANNEL_ONLINE);
            $this->em->persist($order);
        }
        $this->em->flush();

        $this->authenticate($customer);
        $body = $this->jsonRequest('GET', '/api/me/orders?page=1&itemsPerPage=50');

        self::assertArrayHasKey('items', $body);
        self::assertSame(2, $body['total'] ?? null);
        self::assertCount(2, $body['items']);
        $slugs = array_column($body['items'], 'storeSlug');
        self::assertContains($storeA->getSlug(), $slugs);
        self::assertContains($storeB->getSlug(), $slugs);

        $filtered = $this->jsonRequest('GET', '/api/me/orders?page=1&itemsPerPage=50&store='.$storeA->getSlug());
        self::assertSame(1, $filtered['total'] ?? null);
        self::assertSame($storeA->getSlug(), $filtered['items'][0]['storeSlug'] ?? null);
    }

    public function testMyWantListAggregatesAcrossStoresAndFilters(): void
    {
        $storeA = $this->fixtures->store();
        $storeB = $this->fixtures->store();
        $card = $this->fixtures->card(960);
        $customer = $this->fixtures->user(['ROLE_USER']);

        $this->authenticate($customer);
        $this->jsonRequest('POST', "/api/stores/{$storeA->getSlug()}/customer/want-list", [
            'cardId' => (string) $card->getId(),
            'cardName' => $card->getName(),
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        $this->jsonRequest('POST', "/api/stores/{$storeB->getSlug()}/customer/want-list", [
            'cardName' => 'Sol Ring',
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        $all = $this->jsonRequest('GET', '/api/me/want-list');
        self::assertSame(2, $all['total'] ?? null);
        self::assertCount(2, $all['items'] ?? []);
        $slugs = array_column($all['items'], 'storeSlug');
        self::assertContains($storeA->getSlug(), $slugs);
        self::assertContains($storeB->getSlug(), $slugs);

        $filtered = $this->jsonRequest('GET', '/api/me/want-list?store='.$storeA->getSlug());
        self::assertSame(1, $filtered['total'] ?? null);
        self::assertCount(1, $filtered['items'] ?? []);
        self::assertSame($storeA->getSlug(), $filtered['items'][0]['storeSlug'] ?? null);
        self::assertSame($card->getName(), $filtered['items'][0]['cardName'] ?? null);
    }

    public function testMarkingNotificationsReadClearsUnreadList(): void
    {
        $storeA = $this->fixtures->store();
        $storeB = $this->fixtures->store();
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->persist(
            (new CustomerNotification())
                ->setUser($customer)
                ->setStore($storeA)
                ->setType(CustomerNotification::TYPE_SELL_TRADE_ACCEPTED)
                ->setTitle('Sell/trade #1 accepted')
                ->setBody('Accepted'),
        );
        $this->em->persist(
            (new CustomerNotification())
                ->setUser($customer)
                ->setStore($storeB)
                ->setType(CustomerNotification::TYPE_WANT_LIST_MATCH)
                ->setTitle('Sol Ring is in stock')
                ->setBody('In stock'),
        );
        $this->em->flush();

        $this->authenticate($customer);
        $unread = $this->jsonRequest('GET', '/api/me/notifications');
        self::assertSame(2, $unread['unread'] ?? null);
        self::assertCount(2, $unread['items'] ?? []);
        self::assertNull($unread['items'][0]['readAt']);
        self::assertNull($unread['items'][1]['readAt']);

        $this->jsonRequest('PATCH', '/api/me/notifications/read-all?store='.$storeA->getSlug());
        self::assertResponseIsSuccessful();
        $filtered = $this->jsonRequest('GET', '/api/me/notifications?store='.$storeA->getSlug());
        self::assertNotNull($filtered['items'][0]['readAt']);
        $other = $this->jsonRequest('GET', '/api/me/notifications?store='.$storeB->getSlug());
        self::assertNull($other['items'][0]['readAt']);

        $this->jsonRequest('PATCH', '/api/me/notifications/read-all');
        self::assertResponseIsSuccessful();
        $all = $this->jsonRequest('GET', '/api/me/notifications');
        self::assertSame(0, $all['unread'] ?? null);
        self::assertCount(2, $all['items'] ?? []);
        self::assertNotNull($all['items'][0]['readAt']);
        self::assertNotNull($all['items'][1]['readAt']);
    }

    public function testMarkingNotificationsReadCanTargetAType(): void
    {
        $store = $this->fixtures->store();
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->persist(
            (new CustomerNotification())
                ->setUser($customer)
                ->setStore($store)
                ->setType(CustomerNotification::TYPE_ORDER_FULFILLED)
                ->setTitle('Order delivered')
                ->setBody('Delivered'),
        );
        $this->em->persist(
            (new CustomerNotification())
                ->setUser($customer)
                ->setStore($store)
                ->setType(CustomerNotification::TYPE_WANT_LIST_MATCH)
                ->setTitle('Sol Ring is in stock')
                ->setBody('In stock'),
        );
        $this->em->flush();

        $this->authenticate($customer);
        $this->jsonRequest('PATCH', '/api/me/notifications/read-all?type=order_fulfilled');
        self::assertResponseIsSuccessful();

        $list = $this->jsonRequest('GET', '/api/me/notifications');
        self::assertSame(1, $list['unread'] ?? null);
        $byType = [];
        foreach ($list['items'] as $row) {
            $byType[$row['type']] = $row['readAt'] ?? null;
        }
        self::assertArrayHasKey(CustomerNotification::TYPE_ORDER_FULFILLED, $byType);
        self::assertArrayHasKey(CustomerNotification::TYPE_WANT_LIST_MATCH, $byType);
        self::assertNotNull($byType[CustomerNotification::TYPE_ORDER_FULFILLED]);
        self::assertNull($byType[CustomerNotification::TYPE_WANT_LIST_MATCH]);
    }
}
