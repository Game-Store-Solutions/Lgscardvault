<?php

namespace App\Tests\Service\Recommend;

use App\Entity\ReferenceDeck;
use App\Entity\ReferenceDeckCard;
use App\Repository\ReferenceDeckRepository;
use App\Service\Recommend\Intelligence\ReferenceDeckPruner;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Uid\Uuid;

final class ReferenceDeckPrunerTest extends KernelTestCase
{
    public function testPrunesDecksOlderThanRetentionWindow(): void
    {
        self::bootKernel();
        $em = static::getContainer()->get('doctrine')->getManager();
        $catalog = new CatalogFixtures($em);
        $card = $catalog->card(8801, [
            'name' => 'Prune Test Commander',
            'type_line' => 'Legendary Creature — Test',
            'oracle_text' => 'Test.',
            'color_identity' => ['G'],
            'legalities' => ['commander' => 'legal'],
        ]);
        $oracle = $card->getOracleId();
        self::assertInstanceOf(Uuid::class, $oracle);

        $old = new ReferenceDeck('test', 'old-1', $oracle);
        $old->setName('Old deck');
        $old->setFetchedAt(new \DateTimeImmutable('-200 days'));
        $em->persist($old);
        $em->persist(new ReferenceDeckCard($old, $oracle, 1));

        $fresh = new ReferenceDeck('test', 'fresh-1', $oracle);
        $fresh->setName('Fresh deck');
        $fresh->setFetchedAt(new \DateTimeImmutable('-2 days'));
        $em->persist($fresh);
        $em->persist(new ReferenceDeckCard($fresh, $oracle, 1));
        $em->flush();

        $oldId = $old->getId();
        $freshId = $fresh->getId();
        self::assertNotNull($oldId);
        self::assertNotNull($freshId);

        /** @var ReferenceDeckPruner $pruner */
        $pruner = static::getContainer()->get(ReferenceDeckPruner::class);
        $result = $pruner->prune(50);

        self::assertGreaterThanOrEqual(1, $result['decks']);
        self::assertGreaterThanOrEqual(1, $result['cards']);

        /** @var ReferenceDeckRepository $repo */
        $repo = static::getContainer()->get(ReferenceDeckRepository::class);
        self::assertNull($repo->find($oldId));
        self::assertNotNull($repo->find($freshId));
    }
}
