<?php
namespace App\Tests\Controller;

use App\Entity\Game;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * The admin workspace fetches inventory with an unscoped keyset walk and
 * files each item under a game by the card's serialized gameCode. If that
 * field ever drops out of the collection payload, every game's stock lands
 * on the Magic shelf — exactly what stale legacy data looks like, so this
 * guards the payload contract itself.
 */
final class GameCodePayloadReproTest extends WebTestCase
{
    public function testKeysetWalkPayloadCarriesGameCode(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $fixtures = new CatalogFixtures($em);

        $store = $fixtures->store();
        $op = $fixtures->card(9701, ['name' => 'Payload Probe Luffy']);
        $op->setGame($em->getRepository(Game::class)->findOneBy(['code' => 'onepiece']));
        $fixtures->inventoryItem($store, $op, 1);
        $em->flush();

        // Exactly the request the admin frontend makes: keyset, unscoped.
        $client->request('GET', "/api/stores/{$store->getSlug()}/inventory?afterId=0&itemsPerPage=500");
        self::assertSame(200, $client->getResponse()->getStatusCode());
        $data = json_decode((string) $client->getResponse()->getContent(), true);
        $items = $data['member'] ?? $data['hydra:member'] ?? $data;

        $probe = null;
        foreach ($items as $item) {
            if (('Payload Probe Luffy') === ($item['card']['name'] ?? null)) { $probe = $item; }
        }
        self::assertNotNull($probe, 'the OP item is in the walk');
        self::assertSame(
            'onepiece',
            $probe['card']['gameCode'] ?? '(ABSENT)',
            'the workspace filter sorts items by this field; losing it files every game under Magic',
        );
    }
}
