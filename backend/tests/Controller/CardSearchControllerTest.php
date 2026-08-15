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

    public function testWrongCollectorNumberWidensToNameAndSetMatch(): void
    {
        $this->fixtures->card(1, [
            'name' => 'Lightning Bolt',
            'set' => 'clb',
            'collector_number' => '187',
            'games' => ['paper'],
            'finishes' => ['nonfoil', 'foil'],
        ]);

        // Wrong collector used to hard-empty the result. Recovery now widens
        // past a dead collector key so the paper printing in that set still
        // appears (Scryfall has it; the CSV key was just wrong).
        $results = $this->search([
            'q' => 'Lightning Bolt',
            'set' => 'clb',
            'collectorNumber' => '999',
            'finish' => 'nonfoil',
        ]);

        self::assertNotEmpty($results);
        self::assertSame('Lightning Bolt', $results[0]['name']);
        self::assertSame('187', $results[0]['collectorNumber']);
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

    public function testWidensPastDigitalCollectorToPaperPrinting(): void
    {
        // Paper printing of the same card — different collector number.
        $this->fixtures->card(20, [
            'name' => 'Guide of Souls',
            'set' => 'mh3',
            'collector_number' => '20',
            'games' => ['paper', 'arena', 'mtgo'],
            'prices' => ['usd' => '2.50'],
        ]);
        // Digital-only Alchemy printing the CSV row keyed on.
        $this->fixtures->card(29, [
            'name' => 'A-Guide of Souls',
            'set' => 'mh3',
            'collector_number' => 'A-29',
            'games' => ['arena'],
            'digital' => true,
            'prices' => ['usd' => null],
        ]);

        // Recovery UI still sends the failed row's Alchemy collector number.
        // Search must surface the paper printing, not an empty list.
        $results = $this->search([
            'q' => 'Guide of Souls',
            'set' => 'mh3',
            'collectorNumber' => 'A-29',
            'finish' => 'nonfoil',
        ]);

        self::assertNotEmpty($results);
        self::assertSame('Guide of Souls', $results[0]['name']);
        self::assertSame('20', $results[0]['collectorNumber']);
        self::assertFalse(
            in_array('A-29', array_column($results, 'collectorNumber'), true),
            'Alchemy printing must stay out of paper-only search results',
        );
    }

    public function testEmptyQueryReturnsEmpty(): void
    {
        self::assertSame([], $this->search(['q' => '']));
    }
}
