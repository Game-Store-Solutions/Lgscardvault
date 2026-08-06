<?php

namespace App\Tests\Controller;

use App\Entity\SellSubmission;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Sell/Trade portal v2: customers sell any card at a percentage of market
 * price (store credit or cash), buy-list cards pay a premium rate or a
 * fixed pinned offer, staff review with per-line accepted quantities, and
 * completing a submission stocks the cards into inventory with the payout
 * recorded as acquisition cost.
 */
final class StoreBuylistControllerTest extends WebTestCase
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

    public function testTradeRatesResolvePromoAndBuylistPremium(): void
    {
        $store = $this->fixtures->store();
        $base = "/api/stores/{$store->getSlug()}";

        // Defaults apply before the store configures anything.
        $rates = $this->jsonRequest('GET', "$base/trade-rates");
        self::assertSame(60, $rates['creditPercent']);
        self::assertSame(45, $rates['cashPercent']);
        self::assertFalse($rates['promoActive']);

        // Store settings: custom base + premium rates and a live promo.
        $store->setTradeRates([
            'creditRatePercent' => 70,
            'cashRatePercent' => 50,
            'buylistCreditRatePercent' => 85,
            'promoCreditRatePercent' => 80,
            'promoStartsAt' => (new \DateTimeImmutable('-1 hour'))->format(DATE_ATOM),
            'promoEndsAt' => (new \DateTimeImmutable('+1 hour'))->format(DATE_ATOM),
        ]);
        $this->em->flush();

        $rates = $this->jsonRequest('GET', "$base/trade-rates");
        self::assertTrue($rates['promoActive']);
        self::assertSame(80, $rates['creditPercent'], 'promo overrides the base credit rate');
        self::assertSame(50, $rates['cashPercent'], 'no promo cash rate configured, base stays');
        self::assertSame(85, $rates['buylistCreditPercent']);
        self::assertSame(50, $rates['buylistCashPercent'], 'buy-list premium never drops below the regular rate');
        self::assertNotNull($rates['promoEndsAt']);
    }

    public function testFreeFormSellSubmissionPricesFromMarketAtChosenPayoutRate(): void
    {
        $store = $this->fixtures->store();
        $store->setTradeRates(['creditRatePercent' => 60, 'cashRatePercent' => 40]);
        $card = $this->fixtures->card(971);
        $card->setPrices(['usd' => '10.00', 'usd_foil' => '25.00']);
        $unpriced = $this->fixtures->card(972);
        $unpriced->setPrices(null);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->flush();
        $base = "/api/stores/{$store->getSlug()}";

        $this->authenticate($customer);

        // 2x nonfoil at 40% cash of $10.00 = $4.00 each; 1x foil at $25.00 → $10.00.
        $submission = $this->jsonRequest('POST', "$base/sell-submissions", [
            'payoutMethod' => 'cash',
            'items' => [
                ['cardId' => (string) $card->getId(), 'quantity' => 2, 'condition' => 'LP'],
                ['cardId' => (string) $card->getId(), 'quantity' => 1, 'isFoil' => true],
            ],
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('cash', $submission['payoutMethod']);
        self::assertSame(4500, $submission['totalMarketCents']);
        self::assertSame(1800, $submission['totalOfferCents']);
        self::assertCount(2, $submission['items']);
        $byFoil = [];
        foreach ($submission['items'] as $item) {
            $byFoil[$item['isFoil'] ? 'foil' : 'nonfoil'] = $item;
        }
        self::assertSame(400, $byFoil['nonfoil']['offerCentsEach']);
        self::assertSame('LP', $byFoil['nonfoil']['condition']);
        self::assertSame(1000, $byFoil['foil']['offerCentsEach']);
        self::assertFalse($byFoil['nonfoil']['isFromBuylist']);

        // A card without market data cannot be auto-priced.
        $this->jsonRequest('POST', "$base/sell-submissions", [
            'items' => [['cardId' => (string) $unpriced->getId(), 'quantity' => 1]],
        ]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
    }

    public function testBuylistCurationAndPremiumSubmissionFlow(): void
    {
        $store = $this->fixtures->store();
        $store->setTradeRates(['cashRatePercent' => 40, 'buylistCashRatePercent' => 70]);
        $fixed = $this->fixtures->card(970);
        $fixed->setPrices(['usd' => '5.00']);
        $rated = $this->fixtures->card(973);
        $rated->setPrices(['usd' => '10.00']);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->flush();
        $base = "/api/stores/{$store->getSlug()}";

        // Owner curates: one pinned-offer entry with a cap, one rate-based entry.
        $this->authenticate($store->getOwner());
        $fixedEntry = $this->jsonRequest('POST', "$base/buylist", [
            'cardId' => (string) $fixed->getId(),
            'offerCents' => 750,
            'maxQuantity' => 2,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        $ratedEntry = $this->jsonRequest('POST', "$base/buylist", [
            'cardId' => (string) $rated->getId(),
        ]);
        self::assertNull($ratedEntry['offerCents'], 'no pinned offer means the premium rate applies');

        // Deactivated entries disappear from the public portal but staff still see them.
        $this->jsonRequest('PATCH', "$base/buylist/{$ratedEntry['id']}", ['active' => false]);
        $this->authenticate(null);
        self::assertCount(1, $this->jsonRequest('GET', "$base/buylist"));
        $this->authenticate($store->getOwner());
        self::assertCount(2, $this->jsonRequest('GET', "$base/buylist?all=1"));
        $this->jsonRequest('PATCH', "$base/buylist/{$ratedEntry['id']}", ['active' => true]);

        // Customers cannot curate.
        $this->authenticate($customer);
        $this->jsonRequest('POST', "$base/buylist", ['cardId' => (string) $fixed->getId(), 'offerCents' => 1]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        // Split lines of the capped entry merge before clamping (3+2 → 2 copies
        // at the pinned 750); the rate-based entry pays 70% of $10.00.
        $submission = $this->jsonRequest('POST', "$base/sell-submissions", [
            'payoutMethod' => 'cash',
            'items' => [
                ['buylistEntryId' => $fixedEntry['id'], 'quantity' => 3],
                ['buylistEntryId' => $fixedEntry['id'], 'quantity' => 2],
                ['buylistEntryId' => $ratedEntry['id'], 'quantity' => 1],
            ],
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('pending', $submission['status']);
        self::assertCount(2, $submission['items']);
        $byName = array_column($submission['items'], null, 'cardName');
        self::assertSame(2, $byName[$fixed->getName()]['quantity']);
        self::assertSame(750, $byName[$fixed->getName()]['offerCentsEach']);
        self::assertTrue($byName[$fixed->getName()]['isFromBuylist']);
        self::assertSame(700, $byName[$rated->getName()]['offerCentsEach']);
        self::assertSame(2200, $submission['totalOfferCents']);

        // Later buylist repricing never rewrites the in-flight submission.
        $this->authenticate($store->getOwner());
        $this->jsonRequest('PATCH', "$base/buylist/{$fixedEntry['id']}", ['offerCents' => 100]);
        self::assertResponseIsSuccessful();

        $this->authenticate($customer);
        $mine = $this->jsonRequest('GET', "$base/customer/sell-submissions");
        self::assertCount(1, $mine);
        self::assertSame(2200, $mine[0]['totalOfferCents'], 'the offer snapshot survives buylist edits');
    }

    public function testStaffReviewPartialAcceptAndCompletionStocksInventory(): void
    {
        $store = $this->fixtures->store();
        $store->setTradeRates(['cashRatePercent' => 50]);
        $card = $this->fixtures->card(974);
        $card->setPrices(['usd' => '8.00']);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->flush();
        $base = "/api/stores/{$store->getSlug()}";

        $this->authenticate($customer);
        $submission = $this->jsonRequest('POST', "$base/sell-submissions", [
            'payoutMethod' => 'cash',
            'items' => [['cardId' => (string) $card->getId(), 'quantity' => 4, 'condition' => 'LP']],
        ]);
        self::assertSame(1600, $submission['totalOfferCents']);
        $itemId = $submission['items'][0]['id'];

        // Staff accept only 3 of the 4 copies — totals shrink to the deal.
        $this->authenticate($store->getOwner());
        $accepted = $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", [
            'status' => 'accepted',
            'items' => [['id' => $itemId, 'acceptedQuantity' => 3]],
        ]);
        self::assertSame('accepted', $accepted['status']);
        self::assertSame(3, $accepted['items'][0]['acceptedQuantity']);
        self::assertSame(1200, $accepted['totalOfferCents']);
        self::assertSame(2400, $accepted['totalMarketCents']);

        // Completing the deal stocks the accepted copies with the payout as COGS.
        $completed = $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'completed']);
        self::assertSame('completed', $completed['status']);

        $item = $this->em->getConnection()->fetchAssociative(
            'SELECT quantity, condition, acquisition_cost_cents FROM inventory_items WHERE store_id = ? AND card_id = ?',
            [$store->getId(), (string) $card->getId()],
        );
        self::assertNotFalse($item, 'completion creates the inventory row');
        self::assertSame(3, (int) $item['quantity']);
        self::assertSame('LP', $item['condition']);
        self::assertSame(400, (int) $item['acquisition_cost_cents']);

        // Terminal: no further transitions.
        $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'declined']);
        self::assertSame(409, $this->client->getResponse()->getStatusCode());
    }

    public function testStaffCanArchiveAndRestoreAcceptedSubmission(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(976);
        $card->setPrices(['usd' => '2.00']);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->flush();
        $base = "/api/stores/{$store->getSlug()}";

        $this->authenticate($customer);
        $submission = $this->jsonRequest('POST', "$base/sell-submissions", [
            'payoutMethod' => 'cash',
            'items' => [['cardId' => (string) $card->getId(), 'quantity' => 1, 'condition' => 'NM']],
        ]);

        $this->authenticate($store->getOwner());
        $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'accepted']);

        $archived = $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['archived' => true]);
        self::assertNotEmpty($archived['archivedAt']);

        $restored = $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['archived' => false]);
        self::assertNull($restored['archivedAt']);
    }

    public function testKioskSubmissionsRequireStaffAndCustomerName(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(975);
        $card->setPrices(['usd' => '4.00']);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->flush();
        $base = "/api/stores/{$store->getSlug()}";
        $kioskBody = [
            'channel' => 'kiosk',
            'customerName' => 'Walk-up Wanda',
            'items' => [['cardId' => (string) $card->getId(), 'quantity' => 1]],
        ];

        // A regular customer cannot use the kiosk channel.
        $this->authenticate($customer);
        $this->jsonRequest('POST', "$base/sell-submissions", $kioskBody);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        // Staff must type the walk-up customer's name.
        $this->authenticate($store->getOwner());
        $this->jsonRequest('POST', "$base/sell-submissions", ['channel' => 'kiosk', 'customerName' => '  ', 'items' => $kioskBody['items']]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $submission = $this->jsonRequest('POST', "$base/sell-submissions", $kioskBody);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('kiosk', $submission['channel']);
        self::assertSame('Walk-up Wanda', $submission['customerName']);
        self::assertNull($submission['customerEmail'], 'kiosk submissions never leak the staff account email');
    }

    public function testStatusMachineStillGuardsIllegalJumps(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(976);
        $card->setPrices(['usd' => '2.00']);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->em->flush();
        $base = "/api/stores/{$store->getSlug()}";

        $this->authenticate($customer);
        $submission = $this->jsonRequest('POST', "$base/sell-submissions", [
            'items' => [['cardId' => (string) $card->getId(), 'quantity' => 1]],
        ]);
        self::assertSame(SellSubmission::STATUS_PENDING, $submission['status']);

        // pending → completed skips review and is rejected.
        $this->authenticate($store->getOwner());
        $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'completed']);
        self::assertSame(409, $this->client->getResponse()->getStatusCode());

        // Accepting everything at zero quantity is a decline, not an accept.
        $itemId = $submission['items'][0]['id'];
        $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", [
            'status' => 'accepted',
            'items' => [['id' => $itemId, 'acceptedQuantity' => 0]],
        ]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
    }
}
