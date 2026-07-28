<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Store credit ledger: credit-payout sell submissions grant balance on
 * completion, checkout spends it (never overdrafting), cancelling the
 * order refunds it, and staff can adjust within limits.
 */
final class StoreCreditTest extends WebTestCase
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

    private function authenticate(?User $user): void
    {
        $this->bearer = null === $user
            ? null
            : static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
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

    public function testCreditLifecycleEarnSpendRefund(): void
    {
        $store = $this->fixtures->store();
        $store->setTradeRates(['creditRatePercent' => 50]);
        $sellCard = $this->fixtures->card(977);
        $sellCard->setPrices(['usd' => '20.00']);
        $stockCard = $this->fixtures->card(978);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $item = $this->fixtures->inventoryItem($store, $stockCard, quantity: 5, priceCents: 700);
        $this->em->flush();
        $base = "/api/stores/{$store->getSlug()}";

        // Earn: sell 1x at 50% credit of $20.00 → $10.00 credit once completed.
        $this->authenticate($customer);
        $submission = $this->jsonRequest('POST', "$base/sell-submissions", [
            'payoutMethod' => 'credit',
            'items' => [['cardId' => (string) $sellCard->getId(), 'quantity' => 1]],
        ]);
        self::assertSame(1000, $submission['totalOfferCents']);

        $this->authenticate($store->getOwner());
        $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'accepted']);
        self::assertSame(0, $this->creditBalance($base, $customer), 'no credit before completion');
        $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'completed']);
        self::assertSame(1000, $this->creditBalance($base, $customer));

        // Spend: $7.00 order with credit applied → $7.00 off the balance.
        $this->authenticate($customer);
        $this->jsonRequest('PUT', "$base/customer/cart/{$item->getId()}", ['quantity' => 1]);
        $order = $this->jsonRequest('POST', "$base/customer/test-order", ['fulfillment' => 'pickup', 'useStoreCredit' => true]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame(700, $order['creditAppliedCents']);
        self::assertSame(300, $this->creditBalance($base, $customer));

        // Refund: cancelling the order returns the credit with the stock.
        $this->authenticate($store->getOwner());
        $this->client->request(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            server: ['CONTENT_TYPE' => 'application/merge-patch+json', 'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer],
            content: json_encode(['status' => 'cancelled']),
        );
        self::assertResponseIsSuccessful();
        self::assertSame(1000, $this->creditBalance($base, $customer));

        // The ledger keeps the whole story.
        $this->authenticate($customer);
        $credit = $this->jsonRequest('GET', "$base/customer/credit");
        self::assertSame(1000, $credit['balanceCents']);
        self::assertCount(3, $credit['transactions']);
    }

    public function testSpendNeverExceedsBalanceAndStaffCanAdjust(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(979);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $item = $this->fixtures->inventoryItem($store, $card, quantity: 5, priceCents: 900);
        $this->em->flush();
        $base = "/api/stores/{$store->getSlug()}";

        // Staff grant $5.00; a deduction below zero is refused.
        $this->authenticate($store->getOwner());
        $granted = $this->jsonRequest('POST', "$base/customers/{$customer->getId()}/credit", ['amountCents' => 500, 'note' => 'Goodwill']);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame(500, $granted['balanceCents']);
        $this->jsonRequest('POST', "$base/customers/{$customer->getId()}/credit", ['amountCents' => -600]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        // Customers cannot adjust balances.
        $this->authenticate($customer);
        $this->jsonRequest('POST', "$base/customers/{$customer->getId()}/credit", ['amountCents' => 99999]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        // A $9.00 order only draws the $5.00 available.
        $this->jsonRequest('PUT', "$base/customer/cart/{$item->getId()}", ['quantity' => 1]);
        $order = $this->jsonRequest('POST', "$base/customer/test-order", ['fulfillment' => 'pickup', 'useStoreCredit' => true]);
        self::assertSame(500, $order['creditAppliedCents']);
        self::assertSame(0, $this->creditBalance($base, $customer));
    }

    private function creditBalance(string $base, User $customer): int
    {
        $previous = $this->bearer;
        $this->authenticate($customer);
        $credit = $this->jsonRequest('GET', "$base/customer/credit");
        $this->bearer = $previous;

        return (int) ($credit['balanceCents'] ?? -1);
    }
}
