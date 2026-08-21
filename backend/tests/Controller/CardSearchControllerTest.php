<?php

namespace App\Tests\Controller;

use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Catalog search, with emphasis on the CSV failed-row recovery use case: a row
 * carries a (possibly messy) name plus an exact set + collector number, and the
 * manual-resolve UI searches for the matching printing.
 *
 * Regression guard for the bug where search returned an empty 200 for a card
 * that "retry failed cards" could find — because search matched by NAME only,
 * while retry matched by set + collector. Search now also resolves by that
 * natural key, so a misspelled/decorated CSV name still finds the printing.
 *
 * (No network in tests: the local natural-key branch needs none, and the remote
 * fallback is wrapped so its absence degrades to local results, never a 500.)
 */
final class CardSearchControllerTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->client->loginUser($this->fixtures->user(['ROLE_USER']));
    }

    private function search(array $params): array
    {
        $this->client->request('GET', '/api/catalog/search?'.http_build_query($params));
        self::assertResponseIsSuccessful();

        return json_decode($this->client->getResponse()->getContent(), true);
    }

    public function testFindsPrintingByNaturalKeyDespiteMessyName(): void
    {
        // Local catalog holds the real printing under its canonical name.
        $this->fixtures->card(1, ['name' => 'Sol Ring', 'set' => 'c21', 'collector_number' => '263']);

        // The CSV row's name is decorated/misspelled, so a name search misses —
        // but set + collector pin the printing. This is the reported bug.
        $results = $this->search([
            'q' => 'Sol Ring (Retro Frame Etched)',
            'set' => 'c21',
            'collectorNumber' => '263',
            'finish' => 'nonfoil',
        ]);

        self::assertCount(1, $results);
        self::assertSame('Sol Ring', $results[0]['name']);
        self::assertSame('263', $results[0]['collectorNumber']);
    }

    public function testFindsPrintingByExactNameAndKey(): void
    {
        $this->fixtures->card(1, ['name' => 'Lightning Bolt', 'set' => 'clb', 'collector_number' => '187']);

        $results = $this->search([
            'q' => 'Lightning Bolt',
            'set' => 'clb',
            'collectorNumber' => '187',
            'finish' => 'nonfoil',
        ]);

        self::assertCount(1, $results);
        self::assertSame('Lightning Bolt', $results[0]['name']);
    }

    public function testWrongCollectorNumberReturnsNoLocalMatch(): void
    {
        $this->fixtures->card(1, ['name' => 'Lightning Bolt', 'set' => 'clb', 'collector_number' => '187']);

        // Right name + set, wrong collector: the name branch is filtered out by
        // the collector mismatch and the natural-key branch finds nothing local
        // (remote unavailable in tests), so the result is empty — not a 500.
        //
        // Interactive search stays literal on purpose. Widening a dead
        // collector key is failed-row recovery's job, and it lives in
        // App\Service\Recovery so it cannot change this answer.
        $results = $this->search([
            'q' => 'Lightning Bolt',
            'set' => 'clb',
            'collectorNumber' => '999',
            'finish' => 'nonfoil',
        ]);

        self::assertSame([], $results);
    }

    public function testNameOnlySearchStillWorks(): void
    {
        $this->fixtures->card(1, ['name' => 'Counterspell', 'set' => 'mh2', 'collector_number' => '267']);

        // General catalog search (no set/collector) matches by name substring.
        $results = $this->search(['q' => 'Counterspell']);

        self::assertNotEmpty($results);
        self::assertSame('Counterspell', $results[0]['name']);
    }

    public function testFindsCardWhenQueryOmitsAccents(): void
    {
        $this->fixtures->card(1, [
            'name' => 'Adéwalé, Breaker of Chains',
            'set' => 'acr',
            'collector_number' => '224',
        ]);

        $results = $this->search(['q' => 'Adewale']);

        self::assertNotEmpty($results);
        self::assertStringContainsString('Adéwalé', $results[0]['name']);
    }

    public function testOnlineOnlyPrintingsNeverAppear(): void
    {
        $this->fixtures->card(29, [
            'name' => 'A-Guide of Souls',
            'set' => 'mh3',
            'collector_number' => 'A-29',
            'games' => ['arena'],
            'digital' => true,
            'prices' => ['usd' => null],
        ]);

        // No screen may stock a digital printing, so no screen offers one.
        // This rule is global, unlike the recovery ladder.
        self::assertSame([], $this->search(['q' => 'A-Guide of Souls', 'set' => 'mh3']));
    }

    public function testEmptyQueryReturnsEmpty(): void
    {
        self::assertSame([], $this->search(['q' => '']));
    }

    /**
     * Contract guard. Seven screens read this endpoint as a bare JSON array of
     * cards. Failed-row recovery needs a richer payload (relaxed filters,
     * rejected printings), and it must add that to its own endpoint rather
     * than wrapping this one and breaking every other caller.
     */
    public function testResponseIsABareArrayOfCards(): void
    {
        $this->fixtures->card(1, ['name' => 'Counterspell', 'set' => 'mh2', 'collector_number' => '267']);

        $this->client->request('GET', '/api/catalog/search?'.http_build_query(['q' => 'Counterspell']));
        self::assertResponseIsSuccessful();

        $payload = json_decode($this->client->getResponse()->getContent(), true);
        self::assertIsArray($payload);
        self::assertIsList($payload);
        self::assertArrayHasKey(0, $payload);
        self::assertSame('Counterspell', $payload[0]['name']);
        self::assertArrayHasKey('id', $payload[0]);
        self::assertArrayNotHasKey('items', $payload);
        self::assertArrayNotHasKey('relaxed', $payload);
    }

    public function testPrintingsReturnsOtherSetsOfTheSameCard(): void
    {
        $oracle = CatalogFixtures::oracleIdFor(80);
        $current = $this->fixtures->card(80, [
            'name' => 'Abrade',
            'set' => 'soa',
            'collector_number' => '102',
            'oracle_id' => $oracle,
            'lang' => 'ja',
        ]);
        $this->fixtures->card(81, [
            'name' => 'Abrade',
            'set' => 'xln',
            'collector_number' => '134',
            'oracle_id' => $oracle,
        ]);

        $this->client->request('GET', '/api/catalog/cards/'.$current->getId().'/printings');
        self::assertResponseIsSuccessful();
        $payload = json_decode((string) $this->client->getResponse()->getContent(), true);
        $sets = array_column($payload['items'] ?? [], 'setCode');
        sort($sets);
        self::assertSame(['soa', 'xln'], $sets);
    }

    public function testPrintingsRejectsAnInvalidCardId(): void
    {
        $this->client->request('GET', '/api/catalog/cards/not-a-uuid/printings');
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
    }
}
