<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Entity\StoreCase;
use App\Entity\StoreSection;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Case Cards v2: owners manage display cases and their sections, fill them
 * manually or via smart-filtered auto-fill (color identity terms, set, card
 * type, price, rarity), each section acting as its own inventory pool — while
 * the public storefront reads everything anonymously and non-owners are
 * locked out of every mutation.
 */
final class StoreSectionControllerTest extends WebTestCase
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

    /**
     * The /api firewall is stateless JWT, so auth cannot ride a session cookie
     * across requests — every request carries a freshly minted Bearer token.
     */
    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()
            ->get(JWTTokenManagerInterface::class)
            ->create($user);
    }

    private function anonymous(): void
    {
        $this->bearer = null;
    }

    private function jsonRequest(string $method, string $url, ?array $body = null): array
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }

        $this->client->request(
            $method,
            $url,
            server: $server,
            content: null === $body ? '' : json_encode($body),
        );

        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testCaseCrud(): void
    {
        $store = $this->fixtures->store();
        $this->authenticate($store->getOwner());

        $created = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/cases", ['name' => 'Front Counter']);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('Front Counter', $created['name']);
        self::assertSame([], $created['sections']);

        $renamed = $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/cases/{$created['id']}", ['name' => 'Wall Case']);
        self::assertSame('Wall Case', $renamed['name']);

        $this->jsonRequest('DELETE', "/api/stores/{$store->getSlug()}/cases/{$created['id']}");
        self::assertSame(204, $this->client->getResponse()->getStatusCode());
    }

    public function testSectionRequiresCase(): void
    {
        $store = $this->fixtures->store();
        $this->authenticate($store->getOwner());

        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sections", ['title' => 'No case']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
    }

    public function testOwnerCreatesSectionInCase(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store, 'Main Case');
        $this->authenticate($store->getOwner());

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sections", [
            'title' => 'Vintage Power',
            'mode' => 'manual',
            'caseId' => $case->getId(),
        ]);

        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('Vintage Power', $body['title']);
        self::assertSame('Main Case', $body['case']['name']);
        self::assertSame(0, $body['availableQuantity']);
    }

    public function testManualAddTracksPool(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store);
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(101), 4);
        $this->authenticate($store->getOwner());
        $section = $this->createSection($store, $case, 'Manual');

        $body = $this->jsonRequest(
            'POST',
            "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/items",
            ['inventoryItemId' => $item->getId(), 'quantity' => 2],
        );
        self::assertResponseIsSuccessful();
        self::assertCount(1, $body['cards']);
        self::assertSame(2, $body['cards'][0]['quantity']);
        self::assertSame(0, $body['cards'][0]['soldQuantity']);
        self::assertSame(2, $body['cards'][0]['remaining']);
        self::assertSame(2, $body['availableQuantity']);

        // Pool size is editable, clamped at the sold count (0 here).
        $cardId = $body['cards'][0]['id'];
        $body = $this->jsonRequest(
            'PATCH',
            "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/items/{$cardId}",
            ['quantity' => 3],
        );
        self::assertSame(3, $body['cards'][0]['quantity']);
    }

    /**
     * Stocking sheet lifecycle: freshly added pool cards need physical
     * placement, the sheet lists them with their copy counts, marking stocked
     * clears the sheet, and a later pool top-up flags the card again.
     */
    public function testStockingSheetLifecycle(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store);
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(301), 5);
        $this->authenticate($store->getOwner());
        $section = $this->createSection($store, $case, 'Restock me');
        $base = "/api/stores/{$store->getSlug()}/sections/{$section->getId()}";

        // A newly added card awaits stocking.
        $body = $this->jsonRequest('POST', "$base/items", ['inventoryItemId' => $item->getId(), 'quantity' => 2]);
        self::assertTrue($body['cards'][0]['needsStocking']);
        self::assertNull($body['cards'][0]['stockedAt']);

        $sheet = $this->jsonRequest('GET', "$base/stocking-sheet");
        self::assertCount(1, $sheet['rows']);
        self::assertSame(2, $sheet['rows'][0]['copies']);
        self::assertSame(2, $sheet['totalCards']);

        // Marking stocked clears the sheet and stamps the card.
        $body = $this->jsonRequest('POST', "$base/stocking-sheet/mark-stocked", []);
        self::assertFalse($body['cards'][0]['needsStocking']);
        self::assertNotNull($body['cards'][0]['stockedAt']);

        $sheet = $this->jsonRequest('GET', "$base/stocking-sheet");
        self::assertSame([], $sheet['rows']);
        self::assertSame(0, $sheet['totalCards']);

        // Topping up the pool means more copies belong in the case.
        $cardId = $body['cards'][0]['id'];
        $body = $this->jsonRequest('PATCH', "$base/items/{$cardId}", ['quantity' => 4]);
        self::assertTrue($body['cards'][0]['needsStocking']);

        // Shrinking the pool never re-flags an already handled card.
        $this->jsonRequest('POST', "$base/stocking-sheet/mark-stocked", ['cardIds' => [$cardId]]);
        $body = $this->jsonRequest('PATCH', "$base/items/{$cardId}", ['quantity' => 3]);
        self::assertFalse($body['cards'][0]['needsStocking']);

        // The sheet is owner-only.
        $this->anonymous();
        $this->jsonRequest('GET', "$base/stocking-sheet");
        self::assertSame(401, $this->client->getResponse()->getStatusCode());
    }

    /**
     * cardLimit is the section's physical capacity: auto-fill never pulls
     * more than it, manual adds beyond it are rejected, and out-of-range
     * limits 422.
     */
    public function testCardLimitCapsAutoFillAndManualAdds(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store);
        $items = [];
        foreach ([401, 402, 403] as $i => $n) {
            $items[] = $this->fixtures->inventoryItem($store, $this->fixtures->card($n), 2, priceCents: 1000 + $i);
        }
        $this->authenticate($store->getOwner());

        // Auto-fill pulls at most cardLimit cards even with 3 matches.
        $auto = $this->createSection($store, $case, 'Capped auto', StoreSection::MODE_AUTO);
        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sections/{$auto->getId()}/auto-fill", [
            'cardLimit' => 2,
        ]);
        self::assertResponseIsSuccessful();
        self::assertSame(2, $body['cardLimit']);
        self::assertCount(2, $body['cards']);

        // Manual adds stop at the limit with a clear error.
        $manual = $this->createSection($store, $case, 'Capped manual');
        $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/sections/{$manual->getId()}", ['cardLimit' => 1]);
        self::assertResponseIsSuccessful();

        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sections/{$manual->getId()}/items", [
            'inventoryItemId' => $items[0]->getId(),
        ]);
        self::assertResponseIsSuccessful();

        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sections/{$manual->getId()}/items", [
            'inventoryItemId' => $items[1]->getId(),
        ]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('limited to 1', $body['detail']);

        // Out-of-range limits are rejected; clearing works.
        $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/sections/{$manual->getId()}", ['cardLimit' => 0]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/sections/{$manual->getId()}", ['cardLimit' => 999]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        $body = $this->jsonRequest('PATCH', "/api/stores/{$store->getSlug()}/sections/{$manual->getId()}", ['cardLimit' => null]);
        self::assertResponseIsSuccessful();
        self::assertNull($body['cardLimit']);
    }

    public function testAutoFillByColorIdentityTerm(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store);
        // A mono-black card, an Azorius (WU) card, and a colorless card.
        $this->fixtures->inventoryItem($store, $this->fixtures->card(201, ['color_identity' => ['B']]), 1, priceCents: 500);
        $azorius = $this->fixtures->inventoryItem($store, $this->fixtures->card(202, ['color_identity' => ['W', 'U']]), 1, priceCents: 700);
        $this->fixtures->inventoryItem($store, $this->fixtures->card(203, ['color_identity' => []]), 1, priceCents: 900);
        $this->authenticate($store->getOwner());
        $section = $this->createSection($store, $case, 'Azorius', StoreSection::MODE_AUTO);

        $body = $this->jsonRequest(
            'POST',
            "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/auto-fill",
            ['autoColorIdentity' => 'Azorius'],
        );

        self::assertResponseIsSuccessful();
        self::assertCount(1, $body['cards']);
        self::assertSame($azorius->getId(), $body['cards'][0]['inventoryItem']['id']);
        self::assertSame('WU', $body['autoColorIdentity']);
        self::assertSame('Azorius (WU)', $body['autoColorIdentityLabel']);
        self::assertSame(1, $body['cards'][0]['quantity']);
    }

    public function testAutoFillBySetAndCardType(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store);
        $neoCreature = $this->fixtures->inventoryItem(
            $store,
            $this->fixtures->card(301, ['set' => 'neo', 'type_line' => 'Legendary Creature — Dragon']),
            1,
        );
        $this->fixtures->inventoryItem(
            $store,
            $this->fixtures->card(302, ['set' => 'neo', 'type_line' => 'Instant']),
            1,
        );
        $this->fixtures->inventoryItem(
            $store,
            $this->fixtures->card(303, ['set' => 'mh2', 'type_line' => 'Creature — Elf']),
            1,
        );
        $this->authenticate($store->getOwner());
        $section = $this->createSection($store, $case, 'NEO creatures', StoreSection::MODE_AUTO);

        $body = $this->jsonRequest(
            'POST',
            "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/auto-fill",
            ['autoSetCode' => 'NEO', 'autoCardType' => 'Creature'],
        );

        self::assertResponseIsSuccessful();
        self::assertCount(1, $body['cards']);
        self::assertSame($neoCreature->getId(), $body['cards'][0]['inventoryItem']['id']);
    }

    public function testAutoFillRejectsUnknownColorTerm(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store);
        $this->authenticate($store->getOwner());
        $section = $this->createSection($store, $case, 'Bad', StoreSection::MODE_AUTO);

        $body = $this->jsonRequest(
            'POST',
            "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/auto-fill",
            ['autoColorIdentity' => 'purple'],
        );

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('purple', $body['detail']);
    }

    public function testAutoFillSkipsStockClaimedByOtherSections(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store);
        // Single copy in stock, already claimed by section A's pool.
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(401, ['rarity' => 'rare']), 1);
        $this->authenticate($store->getOwner());
        $sectionA = $this->createSection($store, $case, 'A');
        $this->jsonRequest(
            'POST',
            "/api/stores/{$store->getSlug()}/sections/{$sectionA->getId()}/items",
            ['inventoryItemId' => $item->getId()],
        );

        $sectionB = $this->createSection($store, $case, 'B', StoreSection::MODE_AUTO);
        $body = $this->jsonRequest(
            'POST',
            "/api/stores/{$store->getSlug()}/sections/{$sectionB->getId()}/auto-fill",
            ['autoRarity' => 'rare'],
        );

        self::assertResponseIsSuccessful();
        self::assertCount(0, $body['cards'], 'the only copy is already promised to section A');
    }

    public function testPublicCasesListWithoutAuth(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store, 'Public Case');
        $item = $this->fixtures->inventoryItem($store, $this->fixtures->card(501), 1);
        $this->authenticate($store->getOwner());
        $section = $this->createSection($store, $case, 'Featured');
        $this->jsonRequest(
            'POST',
            "/api/stores/{$store->getSlug()}/sections/{$section->getId()}/items",
            ['inventoryItemId' => $item->getId()],
        );

        $this->anonymous();
        $body = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/cases");
        self::assertResponseIsSuccessful();
        self::assertCount(1, $body);
        self::assertSame('Public Case', $body[0]['name']);
        self::assertSame('Featured', $body[0]['sections'][0]['title']);
        self::assertCount(1, $body[0]['sections'][0]['cards']);
        $card = $body[0]['sections'][0]['cards'][0]['inventoryItem']['card'];
        self::assertSame('Test Card 501', $card['name']);
        self::assertArrayNotHasKey('legalities', $card);
        self::assertArrayNotHasKey('oracleText', $card);
        self::assertArrayNotHasKey('prices', $card);
    }

    public function testNonOwnerCannotMutate(): void
    {
        $store = $this->fixtures->store();
        $case = $this->fixtures->storeCase($store);
        $intruder = $this->fixtures->user(['ROLE_USER']);
        $this->authenticate($intruder);

        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/cases", ['name' => 'Nope']);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sections", ['title' => 'Nope', 'caseId' => $case->getId()]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    private function createSection(Store $store, StoreCase $case, string $title, string $mode = StoreSection::MODE_MANUAL): StoreSection
    {
        $body = $this->jsonRequest('POST', "/api/stores/{$store->getSlug()}/sections", [
            'title' => $title,
            'mode' => $mode,
            'caseId' => $case->getId(),
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        return $this->em->getRepository(StoreSection::class)->find($body['id']);
    }
}
