<?php

namespace App\Tests\Controller;

use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\Store;
use App\Entity\StoreCreditTransaction;
use App\Entity\User;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Tests\Support\CatalogFixtures;
use App\Tests\Support\FakeCheckoutGateway;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Real card checkout, where the shopper pays the store through the store's own
 * connected Square account.
 *
 * The invariant under test is that money and stock never disagree: a captured
 * payment leaves a paid order with stock consumed, and a decline leaves the
 * shopper exactly where they started — stock back, credit back, nothing owed.
 */
final class SquareCheckoutTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private FakeCheckoutGateway $gateway;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        // Keep one kernel for the whole test: a reboot would rebuild the
        // container and discard the fake gateway's configured behaviour.
        $this->client->disableReboot();
        $container = static::getContainer();
        $this->em = $container->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);

        // The test environment aliases the gateway interface to the fake
        // (config/services.yaml, when@test), so this is the same instance the
        // controller receives.
        $this->gateway = $container->get(CheckoutGatewayInterface::class);
    }

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    private function jsonRequest(string $method, string $url, ?array $body = null, string $contentType = 'application/json'): array
    {
        $server = ['CONTENT_TYPE' => $contentType];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }

        $this->client->request($method, $url, server: $server, content: null === $body ? '' : json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    /** @return array{Store, InventoryItem, User} */
    private function storeWithStockedListing(int $stock = 5, int $priceCents = 2500): array
    {
        $store = $this->fixtures->store();
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(901), $stock, priceCents: $priceCents);
        $customer = $this->fixtures->user(['ROLE_USER']);

        return [$store, $item, $customer];
    }

    private function fillCart(Store $store, User $customer, InventoryItem $item, int $quantity): void
    {
        $this->authenticate($customer);
        $this->jsonRequest('PUT', "/api/stores/{$store->getSlug()}/customer/cart/{$item->getId()}", ['quantity' => $quantity]);
        self::assertResponseIsSuccessful();
    }

    private function responseCode(): int
    {
        return $this->client->getResponse()->getStatusCode();
    }

    public function testSuccessfulCheckoutChargesExactlyTheAmountDue(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 5, priceCents: 2500);
        $this->fillCart($store, $customer, $item, 2);

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'fulfillment' => 'pickup',
            'token' => 'cnon:card-nonce-ok',
        ]);

        self::assertSame(201, $this->responseCode());
        self::assertSame('pending', $order['status']);
        self::assertSame(5000, $order['totalCents']);
        self::assertSame(5000, $order['paidCents']);

        self::assertCount(1, $this->gateway->charges);
        self::assertSame(5000, $this->gateway->charges[0]['amount']);
        self::assertSame(
            $order['reference'],
            $this->gateway->charges[0]['idempotencyKey'],
            'the order reference keys the charge so a retry cannot bill twice',
        );

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(3, $fresh->getQuantity(), 'a paid order consumes stock');
    }

    public function testCheckoutRejectsShipping(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing();
        $this->fillCart($store, $customer, $item, 1);

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'fulfillment' => 'shipping',
            'token' => 'cnon:card-nonce-ok',
        ]);

        self::assertSame(422, $this->responseCode());
        self::assertStringContainsString('pickup', strtolower((string) ($body['detail'] ?? '')));
        self::assertSame([], $this->gateway->charges);

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(5, $fresh->getQuantity(), 'a rejected shipping checkout never touches stock');
    }

    public function testCheckoutAddsLocationTaxToTheCharge(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 5, priceCents: 2500);
        $this->gateway->addedTaxCents = 200;
        $this->fillCart($store, $customer, $item, 2);

        $quote = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout/quote", []);
        self::assertSame(200, $this->responseCode());
        self::assertSame(5000, $quote['subtotalCents']);
        self::assertSame(200, $quote['taxCents']);
        self::assertSame(5200, $quote['dueCents']);

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'fulfillment' => 'pickup',
            'token' => 'cnon:card-nonce-ok',
        ]);

        self::assertSame(201, $this->responseCode());
        self::assertSame(5000, $order['totalCents']);
        self::assertSame(200, $order['taxCents']);
        self::assertSame(5200, $order['paidCents']);
        self::assertSame(5200, $this->gateway->charges[0]['amount']);
    }

    public function testDeclinedPaymentRestoresStockAndLeavesNoPaidOrder(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 4, priceCents: 1500);
        $this->fillCart($store, $customer, $item, 3);

        $this->gateway->declineWith = 'Your card was declined.';

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'token' => 'cnon:card-nonce-declined',
        ]);

        self::assertSame(402, $this->responseCode());
        self::assertSame('Your card was declined.', $body['detail']);

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(4, $fresh->getQuantity(), 'a decline puts every reserved copy back');

        $orders = $this->em->getRepository(Order::class)->findBy(['store' => $store->getId()]);
        self::assertCount(1, $orders, 'the attempt is still recorded');
        self::assertSame('cancelled', $orders[0]->getStatus()->value);
        self::assertSame(0, $orders[0]->getPaidCents());
        self::assertNull($orders[0]->getPaymentReference());
    }

    public function testStoreCreditReducesTheChargeToTheRemainder(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 5, priceCents: 4000);
        $this->grantCredit($store, $customer, 1500);
        $this->fillCart($store, $customer, $item, 1);

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'useStoreCredit' => true,
            'token' => 'cnon:card-nonce-ok',
        ]);

        self::assertSame(201, $this->responseCode());
        self::assertSame(4000, $order['totalCents']);
        self::assertSame(1500, $order['creditAppliedCents']);
        self::assertSame(2500, $order['paidCents']);
        self::assertSame(2500, $this->gateway->charges[0]['amount'], 'the card covers only what credit did not');
    }

    public function testCreditCoveringMerchandiseStillChargesLocationTax(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 5, priceCents: 1000);
        $this->grantCredit($store, $customer, 5000);
        $this->gateway->addedTaxCents = 80;
        $this->fillCart($store, $customer, $item, 1);

        $quote = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout/quote", [
            'useStoreCredit' => true,
        ]);
        self::assertSame(200, $this->responseCode());
        self::assertSame(1000, $quote['subtotalCents']);
        self::assertSame(1000, $quote['creditCents']);
        self::assertSame(80, $quote['taxCents']);
        self::assertSame(80, $quote['dueCents']);

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'useStoreCredit' => true,
            'token' => 'cnon:card-nonce-ok',
        ]);

        self::assertSame(201, $this->responseCode());
        self::assertSame(1000, $order['creditAppliedCents']);
        self::assertSame(80, $order['taxCents']);
        self::assertSame(80, $order['paidCents']);
        self::assertSame(80, $this->gateway->charges[0]['amount']);
    }

    public function testCreditCoveringTheWholeBasketSkipsTheCardEntirely(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 5, priceCents: 1000);
        $this->grantCredit($store, $customer, 5000);
        $this->fillCart($store, $customer, $item, 1);

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'useStoreCredit' => true,
        ]);

        self::assertSame(201, $this->responseCode());
        self::assertSame('pending', $order['status']);
        self::assertSame(1000, $order['creditAppliedCents']);
        self::assertSame(0, $order['paidCents']);
        self::assertSame([], $this->gateway->charges, 'nothing is due, so nothing is charged');
    }

    public function testDeclineReturnsSpentStoreCredit(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 5, priceCents: 4000);
        $this->grantCredit($store, $customer, 1000);
        $this->fillCart($store, $customer, $item, 1);

        $this->gateway->declineWith = 'Insufficient funds.';
        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'useStoreCredit' => true,
            'token' => 'cnon:card-nonce-declined',
        ]);
        self::assertSame(402, $this->responseCode());

        $credit = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/customer/credit");
        self::assertSame(1000, $credit['balanceCents'], 'a failed charge must not consume credit');
    }

    public function testPayInStoreIsAllowedWhenSquareIsReady(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 4, priceCents: 1800);
        $this->fillCart($store, $customer, $item, 1);
        $this->gateway->ready = true;

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout/pay-in-store", [
            'fulfillment' => 'pickup',
        ]);

        self::assertSame(201, $this->responseCode());
        self::assertSame('pending', $order['status']);
        self::assertSame('Paying in store', $order['notes']);
        self::assertSame(0, $order['paidCents']);
        self::assertSame(1800, $order['totalCents']);
        self::assertNotEmpty($order['paymentUrl']);
        self::assertCount(1, $this->gateway->paymentLinks);
        self::assertSame($order['reference'].'-link', $this->gateway->paymentLinks[0]['idempotencyKey']);
        self::assertSame([], $this->gateway->charges, 'pay in store must not capture a card');

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(3, $fresh->getQuantity(), 'pay in store still reserves stock');
    }

    public function testPayInStoreIsRejectedForShipping(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 3, priceCents: 900);
        $this->fillCart($store, $customer, $item, 1);

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout/pay-in-store", [
            'fulfillment' => 'shipping',
        ]);

        self::assertSame(422, $this->responseCode());
        self::assertStringContainsString('pickup', strtolower((string) ($body['detail'] ?? '')));
        self::assertSame([], $this->gateway->paymentLinks);
        self::assertSame([], $this->gateway->charges);

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(3, $fresh->getQuantity(), 'a rejected pay-in-store checkout never touches stock');
    }

    public function testCheckoutIsRejectedWhenTheStoreHasNotConnectedSquare(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing();
        $this->fillCart($store, $customer, $item, 1);

        $this->gateway->ready = false;

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'token' => 'cnon:card-nonce-ok',
        ]);

        self::assertSame(422, $this->responseCode());
        self::assertSame('This store is not accepting online payments yet.', $body['detail']);

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(5, $fresh->getQuantity(), 'a rejected checkout never touches stock');
    }

    public function testCheckoutRequiresAPaymentMethodWhenMoneyIsDue(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing();
        $this->fillCart($store, $customer, $item, 1);

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", ['fulfillment' => 'pickup']);

        self::assertSame(422, $this->responseCode());
        self::assertSame('A payment method is required.', $body['detail']);
    }

    public function testEmptyCartCannotBeCheckedOut(): void
    {
        [$store, , $customer] = $this->storeWithStockedListing();
        $this->authenticate($customer);

        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", ['token' => 'cnon:card-nonce-ok']);

        self::assertSame(422, $this->responseCode());
    }

    public function testStaffRefundPushesSquareRefundAndRestoresStock(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 5, priceCents: 2500);
        $this->fillCart($store, $customer, $item, 2);

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'fulfillment' => 'pickup',
            'token' => 'cnon:card-nonce-ok',
        ]);
        self::assertSame(201, $this->responseCode());

        $this->authenticate($store->getOwner());
        $updated = $this->jsonRequest(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            ['status' => 'refunded'],
            'application/merge-patch+json',
        );

        self::assertSame(200, $this->responseCode());
        self::assertSame('refunded', $updated['status']);
        self::assertCount(1, $this->gateway->refunds);
        self::assertSame(5000, $this->gateway->refunds[0]['amount']);
        self::assertSame('refund-'.$order['reference'], $this->gateway->refunds[0]['idempotencyKey']);

        $this->em->clear();
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(5, $fresh->getQuantity(), 'a Square refund restores stock');
    }

    public function testStaffRefundFailureLeavesOrderAndStockUnchanged(): void
    {
        [$store, $item, $customer] = $this->storeWithStockedListing(stock: 4, priceCents: 1500);
        $this->fillCart($store, $customer, $item, 1);

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/checkout", [
            'token' => 'cnon:card-nonce-ok',
        ]);
        self::assertSame(201, $this->responseCode());

        $this->gateway->refundDeclineWith = 'Square refund failed.';
        $this->authenticate($store->getOwner());
        $body = $this->jsonRequest(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            ['status' => 'refunded'],
            'application/merge-patch+json',
        );

        self::assertSame(400, $this->responseCode());
        self::assertSame('Square refund failed.', $body['detail']);

        $this->em->clear();
        $freshOrder = $this->em->getRepository(Order::class)->find($order['id']);
        self::assertSame('pending', $freshOrder->getStatus()->value);
        $fresh = $this->em->getRepository(InventoryItem::class)->find($item->getId());
        self::assertSame(3, $fresh->getQuantity(), 'a failed Square refund must not restock');
    }

    public function testConfigEndpointExposesNoSecrets(): void
    {
        [$store, , $customer] = $this->storeWithStockedListing();
        $this->authenticate($customer);

        $config = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/customer/checkout/config");

        self::assertResponseIsSuccessful();
        self::assertSame(
            ['enabled', 'message', 'ownerMessage', 'applicationId', 'locationId', 'environment', 'currency', 'countryCode'],
            array_keys($config),
        );
        // Public config may include shopper/owner status copy, never secrets.
        self::assertArrayNotHasKey('accessToken', $config);
        self::assertArrayNotHasKey('refreshToken', $config);
        self::assertArrayNotHasKey('secret', $config);
    }

    private function grantCredit(Store $store, User $customer, int $amountCents): void
    {
        static::getContainer()->get(\App\Service\Credit\StoreCreditLedger::class)->grant(
            $store,
            $customer,
            $amountCents,
            StoreCreditTransaction::KIND_ADJUSTMENT,
        );
        $this->em->flush();
    }
}
