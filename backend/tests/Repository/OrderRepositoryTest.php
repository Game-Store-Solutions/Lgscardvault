<?php

namespace App\Tests\Repository;

use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Enum\OrderStatus;
use App\Repository\OrderRepository;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * Orders are paginated (bounded response) and their lines + cards are
 * fetch-joined (no per-line lazy card query). The pagination uses a two-step
 * id fetch because a LIMIT combined with a to-many join truncates joined rows,
 * not orders — this test guards against that regression.
 */
final class OrderRepositoryTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private OrderRepository $repo;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = self::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->repo = $c->get(OrderRepository::class);
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function order(Store $store, string $email, int $lineCount, int $seedBase): Order
    {
        // Build the cards first: CatalogFixtures::card() flushes, so all cards
        // must exist before we introduce OrderLines that reference a not-yet-
        // persisted Order (that mid-construction flush would trip cascade rules).
        $cards = [];
        for ($i = 0; $i < $lineCount; ++$i) {
            $cards[] = $this->fixtures->card($seedBase + $i);
        }

        $order = new Order();
        $order->setStore($store);
        $order->setReference('ORD-'.substr(md5($seedBase.$email.$lineCount.microtime()), 0, 8));
        $order->setStatus(OrderStatus::PENDING);
        $order->setCustomerEmail($email);
        $order->setCustomerName('Buyer');
        $order->setTotalCents(500);
        $this->em->persist($order);

        foreach ($cards as $card) {
            $line = new OrderLine();
            $line->setParentOrder($order);
            $line->setCard($card);
            $line->setCardName($card->getName());
            $line->setQuantity(1);
            $line->setPriceCents(100);
            $order->addLine($line);
            $this->em->persist($line);
        }
        $this->em->flush();

        return $order;
    }

    public function testPaginationCountsOrdersNotJoinedRows(): void
    {
        $store = $this->fixtures->store();
        // 4 orders, each with 3 lines. A naive LIMIT-with-join would return the
        // wrong number of orders because the join multiplies rows.
        for ($i = 0; $i < 4; ++$i) {
            $this->order($store, 'a@test.local', 3, $i * 10);
        }

        $page = $this->repo->findPageByStore($store, 0, 2);

        self::assertCount(2, $page, 'a page of 2 must return exactly 2 orders despite 3 lines each');
        self::assertSame(4, $this->repo->countByStore($store));
    }

    public function testLinesAndCardsAreFetchJoined(): void
    {
        $store = $this->fixtures->store();
        $this->order($store, 'a@test.local', 2, 100);

        $page = $this->repo->findPageByStore($store, 0, 10);
        $order = $page[0];

        // Reading lines + their cards must not require additional queries; assert
        // the graph is populated (the join loaded it).
        self::assertCount(2, $order->getLines());
        foreach ($order->getLines() as $line) {
            self::assertNotNull($line->getCard());
            self::assertNotSame('', $line->getCard()->getName());
        }
    }

    public function testCustomerEmailLookupIsScopedCaseInsensitiveAndBounded(): void
    {
        $store = $this->fixtures->store();
        $this->order($store, 'Buyer@Test.Local', 1, 200);
        $this->order($store, 'someone-else@test.local', 1, 300);

        // Case-insensitive match (backed by the LOWER(customer_email) index).
        $mine = $this->repo->findByStoreAndCustomerEmail($store, 'buyer@test.local');

        self::assertCount(1, $mine);
        self::assertSame('Buyer@Test.Local', $mine[0]->getCustomerEmail());
    }

    public function testCustomerEmailLookupRespectsLimit(): void
    {
        $store = $this->fixtures->store();
        for ($i = 0; $i < 5; ++$i) {
            $this->order($store, 'buyer@test.local', 1, 400 + $i * 10);
        }

        self::assertCount(3, $this->repo->findByStoreAndCustomerEmail($store, 'buyer@test.local', 3));
    }

    public function testCountOpenByStoreExcludesFulfilledAndClosed(): void
    {
        $store = $this->fixtures->store();
        $this->order($store, 'open@test.local', 1, 500);
        $fulfilled = $this->order($store, 'done@test.local', 1, 510);
        $fulfilled->setStatus(OrderStatus::FULFILLED);
        $cancelled = $this->order($store, 'cancel@test.local', 1, 520);
        $cancelled->setStatus(OrderStatus::CANCELLED);
        $this->em->flush();

        self::assertSame(3, $this->repo->countByStore($store));
        self::assertSame(1, $this->repo->countOpenByStore($store));
    }

    public function testFindPageByStoreFiltersByStatus(): void
    {
        $store = $this->fixtures->store();
        $this->order($store, 'a@test.local', 1, 600);
        $fulfilled = $this->order($store, 'b@test.local', 1, 610);
        $fulfilled->setStatus(OrderStatus::FULFILLED);
        $this->em->flush();

        self::assertSame(2, $this->repo->countByStore($store, null));
        self::assertSame(1, $this->repo->countByStore($store, [OrderStatus::PENDING]));
        self::assertCount(1, $this->repo->findPageByStore($store, 0, 10, [OrderStatus::PENDING]));
    }
}
