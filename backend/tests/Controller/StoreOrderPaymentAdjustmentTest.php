<?php

namespace App\Tests\Controller;

use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Entity\User;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Service\Payments\PaypalCheckoutGatewayInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeCheckoutGateway;
use App\Tests\Support\FakePaypalCheckoutGateway;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class StoreOrderPaymentAdjustmentTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private FakePaypalCheckoutGateway $paypal;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot();
        $container = static::getContainer();
        $this->em = $container->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $square = $container->get(CheckoutGatewayInterface::class);
        if ($square instanceof FakeCheckoutGateway) {
            $square->ready = false;
            $square->addedTaxCents = 0;
        }
        $this->paypal = $container->get(PaypalCheckoutGatewayInterface::class);
        $this->paypal->ready = true;
        $this->paypal->declineWith = null;
        $this->paypal->refundDeclineWith = null;
        $this->paypal->charges = [];
        $this->paypal->orders = [];
        $this->paypal->refunds = [];
    }

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    /** @return array<string, mixed> */
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

    private function responseCode(): int
    {
        return $this->client->getResponse()->getStatusCode();
    }

    /** @return array{Store, InventoryItem, InventoryItem, User, User} */
    private function storeWithTwoListings(): array
    {
        $store = $this->fixtures->store();
        $store->setRegion('OR');
        $first = $this->fixtures->inventoryItem($store, $this->fixtures->card(4201), 5, priceCents: 2000);
        $second = $this->fixtures->inventoryItem($store, $this->fixtures->card(4202), 4, priceCents: 1500);
        $owner = $store->getOwner();
        self::assertInstanceOf(User::class, $owner);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->flush();

        return [$store, $first, $second, $owner, $customer];
    }

    /** @return array<string, mixed> */
    private function placePaypalOrder(Store $store, User $customer, InventoryItem $item, int $quantity): array
    {
        $this->authenticate($customer);
        $this->jsonRequest('PUT', "/api/stores/{$store->getSlug()}/customer/cart/{$item->getId()}", ['quantity' => $quantity]);
        self::assertResponseIsSuccessful();

        $created = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout/paypal/order", [
            'useStoreCredit' => false,
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($created['detail'] ?? ''));

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'fulfillment' => 'pickup',
            'provider' => 'paypal',
            'token' => $created['orderId'],
        ]);
        self::assertSame(201, $this->responseCode(), (string) ($order['detail'] ?? ''));

        return $order;
    }

    public function testOwnerRefundsNetCreditOnPaypalInOneCall(): void
    {
        [$store, $first, , $owner, $customer] = $this->storeWithTwoListings();
        $order = $this->placePaypalOrder($store, $customer, $first, 2);
        self::assertSame(4000, $order['paidCents']);

        $this->authenticate($owner);
        $lineId = $order['lines'][0]['id'];
        $updated = $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines/{$lineId}", [
            'quantity' => 1,
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($updated['detail'] ?? ''));
        self::assertSame(2000, $updated['totalCents']);
        self::assertSame(4000, $updated['paidCents']);

        $settled = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/payment-adjustment");
        self::assertSame(200, $this->responseCode(), (string) ($settled['detail'] ?? ''));
        self::assertSame(2000, $settled['paidCents']);
        self::assertCount(1, $this->paypal->refunds);
        self::assertSame(2000, $this->paypal->refunds[0]['amount']);
    }

    public function testOwnerChargesNetExtraOnPaypalInOneCapture(): void
    {
        [$store, $first, $second, $owner, $customer] = $this->storeWithTwoListings();
        $order = $this->placePaypalOrder($store, $customer, $first, 1);
        self::assertSame(2000, $order['paidCents']);

        $this->authenticate($owner);
        $updated = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $second->getId(),
            'quantity' => 1,
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($updated['detail'] ?? ''));
        self::assertSame(3500, $updated['totalCents']);
        self::assertSame(2000, $updated['paidCents']);

        $this->authenticate($customer);
        $created = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/orders/{$order['id']}/paypal/order");
        self::assertSame(200, $this->responseCode(), (string) ($created['detail'] ?? ''));
        self::assertSame(1500, $created['dueCents']);

        $captured = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/orders/{$order['id']}/paypal/capture", [
            'paypalOrderId' => $created['orderId'],
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($captured['detail'] ?? ''));
        self::assertSame(3500, $captured['paidCents']);
        self::assertCount(2, $this->paypal->charges);
        self::assertSame(1500, $this->paypal->charges[1]['amount']);
    }

    public function testNothingToRefundReturns422(): void
    {
        [$store, $first, , $owner, $customer] = $this->storeWithTwoListings();
        $order = $this->placePaypalOrder($store, $customer, $first, 1);
        $this->authenticate($owner);

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/payment-adjustment");
        self::assertSame(422, $this->responseCode());
        self::assertStringContainsString('not overpaid', strtolower((string) ($body['detail'] ?? '')));
        self::assertCount(0, $this->paypal->refunds);
    }

    public function testCustomerCannotSettlePayment(): void
    {
        [$store, $first, , , $customer] = $this->storeWithTwoListings();
        $order = $this->placePaypalOrder($store, $customer, $first, 1);

        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/payment-adjustment");
        self::assertContains($this->responseCode(), [403, 404]);
    }

    public function testAddingCardsNotifiesTheShopperOnce(): void
    {
        [$store, $first, $second, $owner, $customer] = $this->storeWithTwoListings();
        $order = $this->placePaypalOrder($store, $customer, $first, 1);

        $this->authenticate($owner);
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $second->getId(),
            'quantity' => 1,
        ]);
        self::assertSame(200, $this->responseCode());

        $this->authenticate($customer);
        $notes = $this->jsonRequest('GET', '/api/me/notifications');
        $dueNotes = array_values(array_filter(
            $notes['items'] ?? [],
            static fn (array $note): bool => 'order_balance_due' === ($note['type'] ?? ''),
        ));
        self::assertCount(1, $dueNotes);
        self::assertNull($dueNotes[0]['readAt']);
        self::assertSame($order['id'], $dueNotes[0]['orderId']);

        $this->authenticate($owner);
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $first->getId(),
            'quantity' => 1,
        ]);
        self::assertSame(200, $this->responseCode());

        $this->authenticate($customer);
        $again = $this->jsonRequest('GET', '/api/me/notifications');
        $dueNotes = array_values(array_filter(
            $again['items'] ?? [],
            static fn (array $note): bool => 'order_balance_due' === ($note['type'] ?? ''),
        ));
        self::assertCount(1, $dueNotes);
        self::assertNull($dueNotes[0]['readAt']);
    }

    public function testShopperCanApproveTheExtraOnPaypalFromTheirAccount(): void
    {
        [$store, $first, $second, $owner, $customer] = $this->storeWithTwoListings();
        $order = $this->placePaypalOrder($store, $customer, $first, 1);

        $this->authenticate($owner);
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $second->getId(),
        ]);
        self::assertSame(200, $this->responseCode());

        $this->authenticate($customer);
        $created = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/orders/{$order['id']}/paypal/order");
        self::assertSame(200, $this->responseCode(), (string) ($created['detail'] ?? ''));
        self::assertSame(1500, $created['dueCents']);

        $captured = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/orders/{$order['id']}/paypal/capture", [
            'paypalOrderId' => $created['orderId'],
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($captured['detail'] ?? ''));
        self::assertSame(3500, $captured['paidCents']);

        $notes = $this->jsonRequest('GET', '/api/me/notifications');
        $dueNotes = array_values(array_filter(
            $notes['items'] ?? [],
            static fn (array $note): bool => 'order_balance_due' === ($note['type'] ?? ''),
        ));
        self::assertCount(1, $dueNotes);
        self::assertNotNull($dueNotes[0]['readAt']);
    }

    public function testGuestCanPayBalanceDueWithSignedLink(): void
    {
        [$store, $first, $second, $owner] = array_values($this->storeWithTwoListings());
        $square = static::getContainer()->get(CheckoutGatewayInterface::class);
        if ($square instanceof FakeCheckoutGateway) {
            $square->ready = false;
        }

        $guestEmail = 'guest-balance-'.bin2hex(random_bytes(4)).'@example.com';
        $created = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/guest/checkout/paypal/order", [
            'lines' => [['inventoryItemId' => $first->getId(), 'quantity' => 1]],
            'customerEmail' => $guestEmail,
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($created['detail'] ?? ''));

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/guest/checkout", [
            'customerName' => 'Guest Shopper',
            'customerEmail' => $guestEmail,
            'fulfillment' => 'pickup',
            'provider' => 'paypal',
            'token' => $created['orderId'],
            'lines' => [['inventoryItemId' => $first->getId(), 'quantity' => 1]],
        ]);
        self::assertSame(201, $this->responseCode(), (string) ($order['detail'] ?? ''));
        self::assertSame(2000, $order['paidCents']);

        $this->authenticate($owner);
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $second->getId(),
            'quantity' => 1,
        ]);
        self::assertSame(200, $this->responseCode());

        $entity = $this->em->find(\App\Entity\Order::class, $order['id']);
        self::assertInstanceOf(\App\Entity\Order::class, $entity);
        $token = static::getContainer()->get(\App\Service\Order\OrderBalanceDueToken::class)->create($entity);

        $this->bearer = null;
        $balance = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/guest/orders/{$order['id']}/balance?token=".rawurlencode($token));
        self::assertSame(200, $this->responseCode(), (string) ($balance['detail'] ?? ''));
        self::assertSame(1500, $balance['balanceDueCents']);

        $createdExtra = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/guest/orders/{$order['id']}/paypal/order", [
            'token' => $token,
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($createdExtra['detail'] ?? ''));

        $captured = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/guest/orders/{$order['id']}/paypal/capture", [
            'token' => $token,
            'paypalOrderId' => $createdExtra['orderId'],
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($captured['detail'] ?? ''));
        self::assertSame(0, $captured['balanceDueCents']);
        self::assertSame(3500, $captured['paidCents']);
    }

    public function testCannotMarkReadyWhileBalanceIsDue(): void
    {
        [$store, $first, $second, $owner, $customer] = $this->storeWithTwoListings();
        $order = $this->placePaypalOrder($store, $customer, $first, 1);

        $this->authenticate($owner);
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines", [
            'inventoryItemId' => $second->getId(),
            'quantity' => 1,
        ]);
        self::assertSame(200, $this->responseCode());

        $this->client->request(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            server: [
                'CONTENT_TYPE' => 'application/merge-patch+json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
            ],
            content: json_encode(['status' => 'fulfilled']),
        );
        self::assertSame(400, $this->responseCode());
    }

    public function testRemovingCardsReturnsExcessStoreCredit(): void
    {
        [$store, $first, , $owner, $customer] = $this->storeWithTwoListings();
        $store->setTradeRates(['creditRatePercent' => 50]);
        $sellCard = $this->fixtures->card(4301);
        $sellCard->setPrices(['usd' => '80.00']);
        $this->em->flush();

        $this->authenticate($customer);
        $submission = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sell-submissions", [
            'payoutMethod' => 'credit',
            'items' => [['cardId' => (string) $sellCard->getId(), 'quantity' => 1]],
        ]);
        $this->authenticate($owner);
        $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/sell-submissions/{$submission['id']}", ['status' => 'accepted']);
        $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/sell-submissions/{$submission['id']}", ['status' => 'completed']);

        $this->authenticate($customer);
        $this->jsonRequest('PUT', "/api/stores/{$store->getSlug()}/customer/cart/{$first->getId()}", ['quantity' => 2]);
        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/test-order", [
            'fulfillment' => 'pickup',
            'useStoreCredit' => true,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame(4000, $order['creditAppliedCents']);

        $this->authenticate($owner);
        $lineId = $order['lines'][0]['id'];
        $updated = $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/orders/{$order['id']}/lines/{$lineId}", [
            'quantity' => 1,
        ]);
        self::assertSame(200, $this->responseCode(), (string) ($updated['detail'] ?? ''));
        self::assertSame(2000, $updated['creditAppliedCents']);

        $this->authenticate($customer);
        $credit = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/customer/credit");
        self::assertSame(2000, $credit['balanceCents']);
    }
}
