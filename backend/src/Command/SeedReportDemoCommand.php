<?php

namespace App\Command;

use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Enum\OrderStatus;
use App\Repository\StoreRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Inserts backdated demo orders so the store admin Reports tab has realistic
 * charts in local/dev. Does not touch inventory stock (free-form lines only).
 */
#[AsCommand(
    name: 'app:seed-report-demo',
    description: 'Seed backdated demo orders for reports (dev/local only)',
)]
final class SeedReportDemoCommand extends Command
{
    private const DEMO_REFERENCE_PREFIX = 'RPT-DEMO-';

    /** @var list<string> */
    private const SLUG_FALLBACKS = ['tcg', 'tcg-shop', 'tcgshop', 'acme-tcg'];

    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly StoreRepository $storeRepository,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('slug', null, InputOption::VALUE_REQUIRED, 'Store slug', 'tcg')
            ->addOption('fresh', null, InputOption::VALUE_NONE, 'Remove previous demo orders for this store, then re-seed');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $slug = (string) $input->getOption('slug');
        $fresh = (bool) $input->getOption('fresh');

        $store = $this->resolveStore($slug);
        if (!$store instanceof Store) {
            $io->error(sprintf(
                'No store found for slug "%s". Tried fallbacks: %s',
                $slug,
                implode(', ', self::SLUG_FALLBACKS),
            ));

            return Command::FAILURE;
        }

        if ($fresh) {
            $removed = $this->removeDemoOrders($store);
            $io->writeln(sprintf('Removed %d previous demo order(s).', $removed));
        } elseif ($this->hasDemoOrders($store)) {
            $io->success(sprintf(
                'Demo report orders already exist for %s (%s). Use --fresh to replace them.',
                $store->getName(),
                $store->getSlug(),
            ));

            return Command::SUCCESS;
        }

        $now = new \DateTimeImmutable('today');
        $templates = $this->orderTemplates();
        $created = 0;

        foreach ($templates as $index => $template) {
            $daysAgo = $template['daysAgo'];
            $createdAt = $now->modify(sprintf('-%d days', $daysAgo))
                ->setTime(10 + ($index % 8), ($index * 13) % 60);

            $order = (new Order())
                ->setStore($store)
                ->setReference(self::DEMO_REFERENCE_PREFIX.strtoupper(bin2hex(random_bytes(3))))
                ->setStatus($template['status'])
                ->setCustomerName($template['customer'])
                ->setCustomerEmail(strtolower(str_replace(' ', '.', $template['customer'])).'@example.com')
                ->setFulfillment(Order::FULFILLMENT_PICKUP)
                ->setChannel($index % 7 === 0 ? Order::CHANNEL_KIOSK : Order::CHANNEL_ONLINE)
                ->setCreatedAt($createdAt);

            $total = 0;
            foreach ($template['lines'] as $lineData) {
                $qty = $lineData['quantity'];
                $price = $lineData['priceCents'];
                $line = (new OrderLine())
                    ->setCardName($lineData['name'])
                    ->setQuantity($qty)
                    ->setPriceCents($price)
                    ->setAcquisitionCostCents($lineData['costCents'] ?? null);
                $order->addLine($line);
                $total += $qty * $price;
            }

            $order->setTotalCents($total);
            $order->setPaidCents(
                in_array($template['status'], [OrderStatus::PAID, OrderStatus::SHIPPED, OrderStatus::COMPLETED, OrderStatus::FULFILLED], true)
                    ? $total
                    : 0,
            );

            $this->entityManager->persist($order);
            ++$created;
        }

        $this->entityManager->flush();

        $io->success(sprintf(
            'Created %d demo orders for %s. Open Reports: /s/%s/admin/reports',
            $created,
            $store->getName(),
            $store->getSlug(),
        ));

        return Command::SUCCESS;
    }

    private function resolveStore(string $slug): ?Store
    {
        $candidates = array_values(array_unique([$slug, ...self::SLUG_FALLBACKS]));
        foreach ($candidates as $candidate) {
            $store = $this->storeRepository->findOneBySlug($candidate);
            if ($store instanceof Store) {
                return $store;
            }
        }

        return null;
    }

    private function hasDemoOrders(Store $store): bool
    {
        return $this->entityManager->createQueryBuilder()
            ->select('COUNT(o.id)')
            ->from(Order::class, 'o')
            ->andWhere('o.store = :store')
            ->andWhere('o.reference LIKE :prefix')
            ->setParameter('store', $store)
            ->setParameter('prefix', self::DEMO_REFERENCE_PREFIX.'%')
            ->getQuery()
            ->getSingleScalarResult() > 0;
    }

    private function removeDemoOrders(Store $store): int
    {
        $orders = $this->entityManager->createQueryBuilder()
            ->select('o')
            ->from(Order::class, 'o')
            ->andWhere('o.store = :store')
            ->andWhere('o.reference LIKE :prefix')
            ->setParameter('store', $store)
            ->setParameter('prefix', self::DEMO_REFERENCE_PREFIX.'%')
            ->getQuery()
            ->getResult();

        foreach ($orders as $order) {
            $this->entityManager->remove($order);
        }

        return count($orders);
    }

    /**
     * Spread orders across ~90 days with varied totals and statuses.
     *
     * @return list<array{
     *   daysAgo: int,
     *   status: OrderStatus,
     *   customer: string,
     *   lines: list<array{name: string, quantity: int, priceCents: int, costCents?: int}>
     * }>
     */
    private function orderTemplates(): array
    {
        $customers = [
            'Alex Rivera', 'Jordan Kim', 'Sam Ortiz', 'Taylor Brooks', 'Casey Nguyen',
            'Morgan Lee', 'Riley Chen', 'Jamie Patel', 'Quinn Adams', 'Drew Martinez',
        ];

        $cards = [
            ['name' => 'Lightning Bolt', 'price' => 350, 'cost' => 120],
            ['name' => 'Sol Ring', 'price' => 899, 'cost' => 450],
            ['name' => 'Counterspell', 'price' => 125, 'cost' => 40],
            ['name' => 'Thor, God of Thunder', 'price' => 1361, 'cost' => 900],
            ['name' => 'Black Lotus (Proxy)', 'price' => 500, 'cost' => 200],
            ['name' => 'Command Tower', 'price' => 299, 'cost' => 150],
            ['name' => 'Smothering Tithe', 'price' => 4200, 'cost' => 2800],
            ['name' => 'Llanowar Elves', 'price' => 45, 'cost' => 15],
        ];

        $templates = [];
        $statusCycle = [
            OrderStatus::COMPLETED,
            OrderStatus::PAID,
            OrderStatus::SHIPPED,
            OrderStatus::PAID,
            OrderStatus::COMPLETED,
            OrderStatus::PENDING,
            OrderStatus::PAID,
            OrderStatus::REFUNDED,
            OrderStatus::SHIPPED,
            OrderStatus::COMPLETED,
        ];

        for ($i = 0; $i < 36; ++$i) {
            $daysAgo = (int) round(($i / 35) * 89);
            $cardA = $cards[$i % count($cards)];
            $cardB = $cards[($i + 3) % count($cards)];
            $lines = [
                [
                    'name' => $cardA['name'],
                    'quantity' => 1 + ($i % 3),
                    'priceCents' => $cardA['price'] + ($i % 4) * 25,
                    'costCents' => $cardA['cost'],
                ],
            ];
            if ($i % 4 === 0) {
                $lines[] = [
                    'name' => $cardB['name'],
                    'quantity' => 1,
                    'priceCents' => $cardB['price'],
                    'costCents' => $i % 8 === 0 ? null : $cardB['cost'],
                ];
            }

            $templates[] = [
                'daysAgo' => $daysAgo,
                'status' => $statusCycle[$i % count($statusCycle)],
                'customer' => $customers[$i % count($customers)],
                'lines' => $lines,
            ];
        }

        return $templates;
    }
}
