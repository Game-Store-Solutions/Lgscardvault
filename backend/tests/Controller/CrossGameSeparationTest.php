<?php

namespace App\Tests\Controller;

use App\Entity\Card;
use App\Entity\CustomerWantListEntry;
use App\Entity\Game;
use App\Entity\StoreCustomer;
use App\Entity\User;
use App\Message\ProcessCsvImportMessage;
use App\MessageHandler\ProcessCsvImportMessageHandler;
use App\Repository\CardRepository;
use App\Service\Deck\DecklistResolver;
use App\Service\Notification\WantListNotifier;
use App\Service\Pricing\MarketPriceResolver;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\Uid\Uuid;

/**
 * The adversarial case for game isolation: a One Piece card engineered to
 * collide with a Magic card on NAME, SET CODE, and COLLECTOR NUMBER. If any
 * query path is unscoped, the doppelgänger leaks through it. Every surface
 * here must keep the two apart.
 */
final class CrossGameSeparationTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private ?string $bearer = null;

    private Card $mtgCard;
    private Card $opCard;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);

        // The doppelgänger pair: identical natural keys, different games.
        $this->mtgCard = $this->fixtures->card(9401, [
            'name' => 'Radiant Duplicate',
            'set' => 'clash',
            'set_name' => 'Clash of Worlds',
            'collector_number' => '77',
            'rarity' => 'rare',
        ]);
        $onepiece = $this->em->getRepository(Game::class)->findOneBy(['code' => 'onepiece']);
        $this->opCard = new Card(Uuid::v4());
        $this->opCard->setOracleId(Uuid::v4());
        $this->opCard->setGame($onepiece);
        $this->opCard->setName('Radiant Duplicate');
        $this->opCard->setSetCode('clash');
        $this->opCard->setSetName('Clash of Worlds');
        $this->opCard->setCollectorNumber('77');
        $this->em->persist($this->opCard);
        $this->em->flush();
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

    public function testCatalogSearchWithoutAGameParamIsMagicNotEverything(): void
    {
        $store = $this->fixtures->store();
        $this->authenticate($store->getOwner());

        // Legacy callers (mass search, buy list, decks) omit the game param.
        $results = $this->jsonRequest('GET', '/api/catalog/search?q=Radiant+Duplicate');
        self::assertSame([(string) $this->mtgCard->getId()], array_column($results, 'id'));

        // Even the definitive natural-key leg must not cross games.
        $byKey = $this->jsonRequest('GET', '/api/catalog/search?q=Radiant&set=clash&collectorNumber=77');
        self::assertSame([(string) $this->mtgCard->getId()], array_column($byKey, 'id'));

        // And the scoped search returns only the One Piece printing.
        $op = $this->jsonRequest('GET', '/api/catalog/search?q=Radiant+Duplicate&game=onepiece');
        self::assertSame([(string) $this->opCard->getId()], array_column($op, 'id'));
    }

    public function testMagicImportResolvesTheMagicPrintingDespiteTheCollision(): void
    {
        $store = $this->fixtures->store();
        $this->authenticate($store->getOwner());

        $csv = "name,game,set,condition,foil,rarity,quantity,variant,collectorNumber\n"
            ."Radiant Duplicate,Magic,clash,NM,No,rare,1,,77\n";
        $path = tempnam(sys_get_temp_dir(), 'import').'.csv';
        file_put_contents($path, $csv);
        $this->client->request(
            'POST',
            "/api/stores/{$store->getSlug()}/csv-imports",
            parameters: ['game' => 'mtg', 'type' => 'cards'],
            files: ['file' => new UploadedFile($path, 'sheet.csv', 'text/csv', null, true)],
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer],
        );
        $job = json_decode((string) $this->client->getResponse()->getContent(), true);
        @unlink($path);

        static::getContainer()->get(ProcessCsvImportMessageHandler::class)(new ProcessCsvImportMessage($job['id']));

        // The Magic import must stock the MAGIC printing, never the One Piece
        // twin that shares its natural key.
        $mtgListing = $this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/inventory?game=mtg");
        $mtgItems = $mtgListing['member'] ?? $mtgListing;
        self::assertCount(1, $mtgItems);
        self::assertSame((string) $this->mtgCard->getId(), $mtgItems[0]['card']['id']);
        self::assertSame([], ($this->jsonRequest('GET', "/api/stores/{$store->getSlug()}/inventory?game=onepiece"))['member'] ?? []);
    }

    public function testDecklistsOnlyLinkMagicPrintings(): void
    {
        $resolver = static::getContainer()->get(DecklistResolver::class);
        $lines = $resolver->resolve('1 Radiant Duplicate');

        self::assertSame(
            (string) $this->mtgCard->getId(),
            (string) $lines[0]['card']?->getId(),
            'a decklist name resolves to the Magic printing, not the One Piece twin',
        );
    }

    public function testWantListAlertsDoNotCrossGames(): void
    {
        $storeA = $this->fixtures->store();
        $storeB = $this->fixtures->store();
        $user = $this->fixtures->user();

        // The customer wants the MAGIC card (entry linked to it) at store A.
        $customer = (new StoreCustomer())->setStore($storeA)->setUser($user);
        $this->em->persist($customer);
        $entry = (new CustomerWantListEntry())
            ->setCustomer($customer)
            ->setCard($this->mtgCard)
            ->setCardName('Radiant Duplicate')
            ->setQuantity(1);
        $this->em->persist($entry);
        $this->em->flush();

        // Store B stocks the ONE PIECE twin: no notification may fire.
        // (Availability alerts hang off the STOCKING store, so read them there.)
        static::getContainer()->get(WantListNotifier::class)->notifyAvailability($storeB, $this->opCard);
        $this->em->flush();
        $this->authenticate($user);
        $notifications = $this->jsonRequest('GET', "/api/stores/{$storeB->getSlug()}/customer/notifications");
        self::assertSame([], $notifications, 'stocking the One Piece twin must not alert a Magic want');

        // Stocking the MAGIC printing still notifies as before.
        static::getContainer()->get(WantListNotifier::class)->notifyAvailability($storeB, $this->mtgCard);
        $this->em->flush();
        $notifications = $this->jsonRequest('GET', "/api/stores/{$storeB->getSlug()}/customer/notifications");
        self::assertCount(1, $notifications);
    }

    public function testUnpricedNonMagicCardsAreNeverHealedThroughScryfall(): void
    {
        $resolver = static::getContainer()->get(MarketPriceResolver::class);

        // In the test environment any real Scryfall call would fail loudly or
        // hang; the resolver must simply decline for a non-Magic card.
        self::assertNull($resolver->marketPriceCents($this->opCard, false));
        self::assertSame($this->opCard, $resolver->ensurePriced($this->opCard));
        self::assertNull($this->opCard->getPrices(), 'the One Piece card stays untouched');
    }

    public function testSetCodeVocabularyIsPerGame(): void
    {
        // "clash" exists in both games; the legacy helpers speak Magic only.
        $cards = static::getContainer()->get(CardRepository::class);
        $byKey = $cards->findByNaturalKey('clash', '77');
        self::assertCount(1, $byKey);
        self::assertSame('mtg', $byKey[0]->resolvedGameCode());

        // The game-scoped lookup finds the One Piece printing by ITS key.
        $onepiece = $this->em->getRepository(Game::class)->findOneBy(['code' => 'onepiece']);
        $op = $cards->findOneForGame($onepiece, 'Radiant Duplicate', 'clash', '77');
        self::assertSame((string) $this->opCard->getId(), (string) $op?->getId());
    }
}
