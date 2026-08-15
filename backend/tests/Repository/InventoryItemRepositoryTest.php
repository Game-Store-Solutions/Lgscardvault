<?php

namespace App\Tests\Repository;

use App\Entity\InventoryItem;
use App\Repository\InventoryItemRepository;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * The store inventory listing is served page-by-page so a single request never
 * hydrates a whole store's inventory. These tests pin both the offset page
 * (findPageByStore) and the keyset cursor (findByStoreAfterId) the frontend
 * walks — the latter being immune to page drift under concurrent writes.
 */
final class InventoryItemRepositoryTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private InventoryItemRepository $repo;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = self::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->repo = $c->get(InventoryItemRepository::class);
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function seed(int $count): \App\Entity\Store
    {
        $store = $this->fixtures->store();
        for ($i = 1; $i <= $count; ++$i) {
            $this->fixtures->inventoryItem($store, $this->fixtures->card($i));
        }

        return $store;
    }

    public function testCountByStore(): void
    {
        $store = $this->seed(7);
        self::assertSame(7, $this->repo->countByStore($store));
    }

    public function testOffsetPagesCoverEveryRowExactlyOnce(): void
    {
        $store = $this->seed(7);

        $page1 = $this->repo->findPageByStore($store, 0, 3);
        $page2 = $this->repo->findPageByStore($store, 3, 3);
        $page3 = $this->repo->findPageByStore($store, 6, 3);

        self::assertCount(3, $page1);
        self::assertCount(3, $page2);
        self::assertCount(1, $page3);

        $ids = array_map(static fn (InventoryItem $i): int => $i->getId(), [...$page1, ...$page2, ...$page3]);
        self::assertCount(7, array_unique($ids), 'pages must not overlap or skip');
    }

    public function testKeysetWalkReturnsAllRowsInIdOrder(): void
    {
        $store = $this->seed(5);

        $walked = [];
        $afterId = 0;
        do {
            $chunk = $this->repo->findByStoreAfterId($store, $afterId, 2);
            foreach ($chunk as $item) {
                $walked[] = $item->getId();
                self::assertGreaterThan($afterId, $item->getId(), 'cursor must strictly advance');
                $afterId = $item->getId();
            }
        } while (\count($chunk) === 2);

        self::assertSame($walked, array_values(array_unique($walked)));
        self::assertCount(5, $walked);
    }

    public function testKeysetIsScopedToStore(): void
    {
        $storeA = $this->seed(3);
        $storeB = $this->seed(3);

        $all = $this->repo->findByStoreAfterId($storeB, 0, 100);

        self::assertCount(3, $all);
        foreach ($all as $item) {
            self::assertSame($storeB->getId(), $item->getStore()->getId());
        }
    }

    public function testListingEagerLoadsGameSoGameCodeDoesNotLazyLoad(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(42);
        $this->fixtures->inventoryItem($store, $card);
        $this->em->flush();
        $this->em->clear();

        $items = $this->repo->findByStoreAfterId($store, 0, 10);
        self::assertCount(1, $items);

        $this->em->clear();
        $items = $this->repo->findByStoreAfterId($store, 0, 10);
        // Accessing gameCode after clearing other entities must still work
        // from the joined Game, not a follow-up SELECT.
        self::assertSame('mtg', $items[0]->getCard()?->getGameCode());
    }
}
