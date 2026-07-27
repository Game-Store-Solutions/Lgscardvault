<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Entity\StoreCase;
use App\Entity\StoreSection;
use App\Entity\StoreSectionCard;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * The case-section inventory lifecycle across a purchase: placing an order
 * depletes the section pool (never oversold), stamps the line with case +
 * section for fulfillment paperwork, feeds the section's pull sheet, and a
 * cancellation returns the copies to the pool.
 */
final class CasePurchaseFlowTest extends WebTestCase
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

    /**
     * @return array{Store, StoreSection, \App\Entity\InventoryItem}
     */
    private function storeWithCasedListing(int $stock, int $pool): array
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store, 'Front Counter');
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(801), $stock, priceCents: 2500);

        $section = new StoreSection();
        $section->setStore($store);
        $section->setStoreCase($case);
        $section->setTitle('Black');
        $this->em->persist($section);

        $sectionCard = new StoreSectionCard();
        $sectionCard->setInventoryItem($item);
        $sectionCard->setQuantity($pool);
        $section->addCard($sectionCard);
        $this->em->flush();

        return [$store, $section, $item];
    }

    private function placeOrder(Store $store, User $customer, int $itemId, int $quantity): array
    {
        $this->authenticate($customer);
        $this->jsonRequest('PUT', "/api/stores/{$store->getSlug()}/customer/cart/{$itemId}", ['quantity' => $quantity]);
        self::assertResponseIsSuccessful();

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/customer/test-order");
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        return $order;
    }

    public function testPurchaseDepletesPoolAndStampsLine(): void
    {
        [$store, $section, $item] = $this->storeWithCasedListing(stock: 5, pool: 2);
        $customer = $this->fixtures->user(['ROLE_USER']);

        // Buy 3 copies: 2 come from the case pool, 1 is back-stock.
        $order = $this->placeOrder($store, $customer, $item->getId(), 3);

        self::assertSame('Front Counter', $order['lines'][0]['caseName']);
        self::assertSame('Black', $order['lines'][0]['sectionTitle']);
        self::assertSame(2, $order['lines'][0]['caseQuantity']);

        $this->em->clear();
        $pool = $this->em->getRepository(StoreSectionCard::class)->findOneBy(['section' => $section->getId()]);
        self::assertSame(2, $pool->getSoldQuantity());
        self::assertSame(0, $pool->remaining(), 'the pool is exactly exhausted — never oversold');
    }

    public function testSecondPurchaseBeyondPoolIsNotCaseLabeled(): void
    {
        [$store, , $item] = $this->storeWithCasedListing(stock: 5, pool: 1);

        $first = $this->placeOrder($store, $this->fixtures->user(['ROLE_USER']), $item->getId(), 1);
        self::assertSame(1, $first['lines'][0]['caseQuantity']);

        // Pool is now empty: the next sale is plain inventory, no case label.
        $second = $this->placeOrder($store, $this->fixtures->user(['ROLE_USER']), $item->getId(), 1);
        self::assertSame(0, $second['lines'][0]['caseQuantity']);
        self::assertNull($second['lines'][0]['caseName']);
    }

    public function testPullSheetTracksOrderLifecycle(): void
    {
        [$store, $section, $item] = $this->storeWithCasedListing(stock: 5, pool: 2);
        $customer = $this->fixtures->user(['ROLE_USER'], 'case-buyer@test.local');
        $order = $this->placeOrder($store, $customer, $item->getId(), 1);

        // The owner's pull sheet lists the placed order's case card.
        $this->authenticate($store->getOwner());
        $sheet = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/pull-sheet");
        self::assertResponseIsSuccessful();
        self::assertSame('Front Counter', $sheet['caseName']);
        self::assertSame('Black', $sheet['sectionTitle']);
        self::assertSame(1, $sheet['totalCards']);
        self::assertCount(1, $sheet['rows']);
        self::assertSame($order['reference'], $sheet['rows'][0]['orderReference']);
        self::assertSame(1, $sheet['rows'][0]['quantity']);
        self::assertSame('case-buyer@test.local', $sheet['rows'][0]['customerEmail']);

        // Fulfilling the order pulls it off the sheet (card has been pulled).
        $this->jsonRequest(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            ['status' => 'received'],
            'application/merge-patch+json',
        );
        self::assertResponseIsSuccessful();
        $this->jsonRequest(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            ['status' => 'fulfilled'],
            'application/merge-patch+json',
        );
        self::assertResponseIsSuccessful();

        $sheet = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/pull-sheet");
        self::assertSame(0, $sheet['totalCards']);
        self::assertCount(0, $sheet['rows']);
    }

    /**
     * A sale consumes real inventory at placement, and cancelling or
     * refunding the order puts exactly the purchased copies back.
     */
    public function testPurchaseReducesInventoryAndCancelRestoresIt(): void
    {
        [$store, , $item] = $this->storeWithCasedListing(stock: 5, pool: 1);
        $order = $this->placeOrder($store, $this->fixtures->user(['ROLE_USER']), $item->getId(), 3);

        $this->em->clear();
        $fresh = $this->em->getRepository(\App\Entity\InventoryItem::class)->find($item->getId());
        self::assertSame(2, $fresh->getQuantity(), 'placing the order consumes 3 of 5 copies');

        $this->authenticate($store->getOwner());
        $this->jsonRequest(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            ['status' => 'cancelled'],
            'application/merge-patch+json',
        );
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $fresh = $this->em->getRepository(\App\Entity\InventoryItem::class)->find($item->getId());
        self::assertSame(5, $fresh->getQuantity(), 'cancelling restores the purchased copies');
    }

    public function testRefundAfterReceivingRestoresInventory(): void
    {
        [$store, , $item] = $this->storeWithCasedListing(stock: 4, pool: 1);
        $order = $this->placeOrder($store, $this->fixtures->user(['ROLE_USER']), $item->getId(), 2);

        $this->authenticate($store->getOwner());
        foreach (['received', 'refunded'] as $status) {
            $this->jsonRequest(
                'PATCH',
                "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
                ['status' => $status],
                'application/merge-patch+json',
            );
            self::assertResponseIsSuccessful();
        }

        $this->em->clear();
        $fresh = $this->em->getRepository(\App\Entity\InventoryItem::class)->find($item->getId());
        self::assertSame(4, $fresh->getQuantity(), 'refunding restores the purchased copies');
    }

    /**
     * Kiosk orders (staff-entered, channel=kiosk) behave like checkout when
     * lines reference real listings: stock is consumed, case pools deplete,
     * and a typed customer user id attributes the order to that account.
     */
    public function testKioskOrderConsumesStockAndAttributesCustomer(): void
    {
        [$store, $section, $item] = $this->storeWithCasedListing(stock: 5, pool: 2);
        $customer = $this->fixtures->user(['ROLE_USER'], 'kiosk-shopper@test.local');
        $this->authenticate($store->getOwner());

        $order = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders", [
            'channel' => 'kiosk',
            'fulfillment' => 'pickup',
            'kioskUserId' => $customer->getId(),
            'inputLines' => [['inventoryItemId' => $item->getId(), 'quantity' => 2]],
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('kiosk', $order['channel']);
        self::assertSame('kiosk-shopper@test.local', $order['customerEmail']);
        self::assertSame(2 * 2500, $order['totalCents']);

        $this->em->clear();
        $fresh = $this->em->getRepository(\App\Entity\InventoryItem::class)->find($item->getId());
        self::assertSame(3, $fresh->getQuantity(), 'the kiosk sale consumes real stock');

        $pool = $this->em->getRepository(StoreSectionCard::class)->findOneBy(['section' => $section->getId()]);
        self::assertSame(2, $pool->getSoldQuantity(), 'case pool depletes like an online sale');
    }

    /**
     * COGS: the listing's acquisition cost is snapshotted per-unit onto the
     * order line at sale time, and store staff can read it back from the
     * orders endpoint for profit reporting.
     */
    public function testAcquisitionCostSnapshotsOntoOrderLines(): void
    {
        [$store, , $item] = $this->storeWithCasedListing(stock: 5, pool: 1);
        $item->setAcquisitionCostCents(900);
        $this->em->flush();

        $this->placeOrder($store, $this->fixtures->user(['ROLE_USER']), $item->getId(), 2);

        $this->authenticate($store->getOwner());
        $orders = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/orders");
        $lines = $orders['member'][0]['lines'] ?? $orders[0]['lines'] ?? [];
        self::assertSame(900, $lines[0]['acquisitionCostCents']);

        // Repricing the listing later must not rewrite historical COGS.
        $this->em->clear();
        $fresh = $this->em->getRepository(\App\Entity\InventoryItem::class)->find($item->getId());
        $fresh->setAcquisitionCostCents(5000);
        $this->em->flush();

        $orders = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/orders");
        $lines = $orders['member'][0]['lines'] ?? $orders[0]['lines'] ?? [];
        self::assertSame(900, $lines[0]['acquisitionCostCents'], 'the snapshot survives listing cost changes');
    }

    public function testKioskOrderRejectsUnknownCustomerId(): void
    {
        [$store, , $item] = $this->storeWithCasedListing(stock: 2, pool: 1);
        $this->authenticate($store->getOwner());

        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/orders", [
            'channel' => 'kiosk',
            'kioskUserId' => 999999,
            'inputLines' => [['inventoryItemId' => $item->getId(), 'quantity' => 1]],
        ]);
        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }

    public function testCancellationRestoresThePool(): void
    {
        [$store, $section, $item] = $this->storeWithCasedListing(stock: 5, pool: 1);
        $order = $this->placeOrder($store, $this->fixtures->user(['ROLE_USER']), $item->getId(), 1);

        $this->authenticate($store->getOwner());
        $this->jsonRequest(
            'PATCH',
            "/api/stores/{$store->getSlug()}/orders/{$order['id']}",
            ['status' => 'cancelled'],
            'application/merge-patch+json',
        );
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $pool = $this->em->getRepository(StoreSectionCard::class)->findOneBy(['section' => $section->getId()]);
        self::assertSame(0, $pool->getSoldQuantity(), 'cancelling returns the copy to the section pool');
        self::assertSame(1, $pool->remaining());

        // And the pull sheet no longer asks staff to pull it.
        $sheet = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/pull-sheet");
        self::assertCount(0, $sheet['rows']);
    }
}
