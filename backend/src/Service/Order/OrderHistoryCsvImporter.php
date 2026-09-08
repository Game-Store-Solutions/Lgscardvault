<?php

namespace App\Service\Order;

use App\Entity\Card;
use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Enum\OrderStatus;
use App\Repository\CardRepository;
use App\Repository\OrderRepository;
use App\Repository\UserRepository;
use App\Service\CsvImport\CsvGrid;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Platform-admin import of legacy shopper orders from a previous site CSV.
 *
 * Orders are attributed by customerEmail so existing platform users see them
 * under account / store history automatically — no StoreCustomer link required.
 * Inventory is never touched.
 */
final class OrderHistoryCsvImporter
{
    public const MAX_ROWS = 5000;

    /** @var array<string, string> */
    private const HEADER_ALIASES = [
        'customeremail' => 'customerEmail',
        'email' => 'customerEmail',
        'customername' => 'customerName',
        'name' => 'customerName',
        'orderid' => 'orderId',
        'reference' => 'orderId',
        'ordernumber' => 'orderId',
        'date' => 'date',
        'orderdate' => 'date',
        'createdat' => 'date',
        'type' => 'type',
        'channel' => 'type',
        'fulfillmentmethod' => 'fulfillmentMethod',
        'fulfillment' => 'fulfillmentMethod',
        'paymentstatus' => 'paymentStatus',
        'status' => 'status',
        'itemcount' => 'itemCount',
        'shippingcost' => 'shippingCost',
        'tax' => 'tax',
        'total' => 'total',
        'refunded' => 'refunded',
        'nettotal' => 'netTotal',
        'items' => 'items',
        'trackingnumber' => 'trackingNumber',
        'shippingaddress' => 'shippingAddress',
    ];

    public function __construct(
        private readonly CsvGrid $grid,
        private readonly OrderRepository $orders,
        private readonly UserRepository $users,
        private readonly CardRepository $cards,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /** @var array<string, string|null> label => card UUID string (or null miss) */
    private array $cardResolveCache = [];

    /**
     * @return array{
     *     imported: int,
     *     skipped: int,
     *     matchedUsers: int,
     *     matchedOrders: int,
     *     cardsLinked: int,
     *     dryRun: bool,
     *     storeSlug: string,
     *     errors: list<array{row: int, orderId: ?string, message: string}>,
     *     warnings: list<array{row: int, orderId: ?string, message: string}>
     * }
     */
    public function import(Store $store, string $csv, bool $dryRun = false): array
    {
        if (\function_exists('set_time_limit')) {
            @set_time_limit(300);
        }

        $this->cardResolveCache = [];
        $csv = $this->decodeCsvBytes($csv);
        $grid = $this->grid->toRows($csv, self::MAX_ROWS);
        if (count($grid) < 2) {
            throw new \InvalidArgumentException('CSV must have a header row and at least one data row.');
        }
        if (count($grid) > self::MAX_ROWS + 1) {
            throw new \InvalidArgumentException(sprintf('CSV exceeds the maximum of %d orders.', self::MAX_ROWS));
        }

        $index = $this->headerIndex($grid[0]);
        foreach (['customerEmail', 'orderId', 'date', 'status', 'total', 'items'] as $required) {
            if (!isset($index[$required])) {
                throw new \InvalidArgumentException(sprintf('CSV must include a "%s" column.', $required));
            }
        }

        /** @var list<array{
         *   row: int,
         *   rawOrderId: string,
         *   reference: string,
         *   email: string,
         *   customerName: string,
         *   createdAt: \DateTimeImmutable,
         *   status: OrderStatus,
         *   totalCents: int,
         *   taxCents: int,
         *   netCents: int,
         *   channel: string,
         *   fulfillment: string,
         *   paymentStatus: string,
         *   notes: string|null,
         *   lines: list<array{cardName: string, quantity: int, priceCents: int}>,
         *   warnings: list<string>
         * }> $candidates */
        $candidates = [];
        $errors = [];
        $warnings = [];
        $seenRefs = [];
        $cardsLinked = 0;

        foreach (array_slice($grid, 1) as $offset => $cols) {
            $rowNumber = $offset + 2;
            $cell = static fn (string $key): string => isset($index[$key])
                ? trim((string) ($cols[$index[$key]] ?? ''))
                : '';

            $rawOrderId = $cell('orderId');
            $email = mb_strtolower($cell('customerEmail'));
            if ('' === $rawOrderId) {
                $errors[] = ['row' => $rowNumber, 'orderId' => null, 'message' => 'Order id is required.'];
                continue;
            }

            $reference = $this->normalizeReference($rawOrderId);
            if (null === $reference) {
                $errors[] = ['row' => $rowNumber, 'orderId' => $rawOrderId, 'message' => 'Order id is too long or empty after normalizing.'];
                continue;
            }
            if (isset($seenRefs[$reference])) {
                $errors[] = ['row' => $rowNumber, 'orderId' => $rawOrderId, 'message' => 'Duplicate order id in this file.'];
                continue;
            }
            $seenRefs[$reference] = true;

            if ('' === $email || false === filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $errors[] = ['row' => $rowNumber, 'orderId' => $rawOrderId, 'message' => 'Customer email is not valid.'];
                continue;
            }

            $createdAt = $this->parseDate($cell('date'));
            if (!$createdAt instanceof \DateTimeImmutable) {
                $errors[] = ['row' => $rowNumber, 'orderId' => $rawOrderId, 'message' => 'Date is not valid (use YYYY-MM-DD).'];
                continue;
            }

            $status = $this->mapStatus($cell('status'));
            if (!$status instanceof OrderStatus) {
                $errors[] = ['row' => $rowNumber, 'orderId' => $rawOrderId, 'message' => sprintf('Unknown status "%s".', $cell('status'))];
                continue;
            }

            $totalCents = $this->dollarsToCents($cell('total'));
            if (null === $totalCents) {
                $errors[] = ['row' => $rowNumber, 'orderId' => $rawOrderId, 'message' => 'Total is not a valid dollar amount.'];
                continue;
            }
            $taxCents = $this->dollarsToCents($cell('tax')) ?? 0;
            $netCents = $this->dollarsToCents($cell('netTotal'));
            if (null === $netCents) {
                $netCents = $totalCents;
            }

            $rowWarnings = [];
            $lines = $this->parseItems($cell('items'), $totalCents, $rowWarnings);
            if ([] === $lines) {
                $errors[] = ['row' => $rowNumber, 'orderId' => $rawOrderId, 'message' => 'Items column could not be parsed.'];
                continue;
            }

            $declared = (int) $cell('itemCount');
            $parsedUnits = array_sum(array_column($lines, 'quantity'));
            if ($declared > 0 && $parsedUnits !== $declared) {
                $rowWarnings[] = sprintf('Item count column says %d but parsed %d line unit(s).', $declared, $parsedUnits);
            }

            foreach ($rowWarnings as $message) {
                $warnings[] = ['row' => $rowNumber, 'orderId' => $rawOrderId, 'message' => $message];
            }

            $candidates[] = [
                'row' => $rowNumber,
                'rawOrderId' => $rawOrderId,
                'reference' => $reference,
                'email' => $email,
                'customerName' => $cell('customerName'),
                'createdAt' => $createdAt,
                'status' => $status,
                'totalCents' => $totalCents,
                'taxCents' => max(0, $taxCents),
                'netCents' => $netCents,
                'channel' => $this->mapChannel($cell('type')),
                'fulfillment' => $this->mapFulfillment($cell('fulfillmentMethod')),
                'paymentStatus' => $cell('paymentStatus'),
                'notes' => $this->buildNotes($cell('paymentStatus'), $cell('trackingNumber'), $cell('shippingAddress'), $cell('refunded'), $rawOrderId),
                'lines' => $lines,
                'warnings' => $rowWarnings,
            ];
        }

        $existingRefs = $this->existingReferences(array_column($candidates, 'reference'));
        $existingEmails = $this->existingEmails(array_column($candidates, 'email'));

        $imported = 0;
        $skipped = 0;
        $matchedOrders = 0;
        /** @var array<string, true> $matchedEmails */
        $matchedEmails = [];

        foreach ($candidates as $candidate) {
            if (isset($existingRefs[$candidate['reference']])) {
                ++$skipped;
                $warnings[] = [
                    'row' => $candidate['row'],
                    'orderId' => $candidate['rawOrderId'],
                    'message' => 'Already imported (same reference).',
                ];
                continue;
            }

            if (isset($existingEmails[$candidate['email']])) {
                $matchedEmails[$candidate['email']] = true;
                ++$matchedOrders;
            }

            if ($dryRun) {
                ++$imported;
                continue;
            }

            $order = (new Order())
                ->setStore($store)
                ->setReference($candidate['reference'])
                ->setStatus($candidate['status'])
                ->setCustomerName('' !== $candidate['customerName'] ? mb_substr($candidate['customerName'], 0, 255) : null)
                ->setCustomerEmail(mb_substr($candidate['email'], 0, 255))
                ->setFulfillment($candidate['fulfillment'])
                ->setChannel($candidate['channel'])
                ->setTotalCents($candidate['totalCents'])
                ->setTaxCents($candidate['taxCents'])
                ->setPaidCents($this->paidCentsFor(
                    $candidate['status'],
                    $candidate['totalCents'],
                    $candidate['taxCents'],
                    $candidate['paymentStatus'],
                ))
                ->setNotes($candidate['notes'])
                ->setCreatedAt($candidate['createdAt']);

            foreach ($candidate['lines'] as $line) {
                $orderLine = (new OrderLine())
                    ->setCardName($line['cardName'])
                    ->setQuantity($line['quantity'])
                    ->setPriceCents($line['priceCents']);
                $cardId = $this->resolveCardIdFromLineLabel($line['cardName']);
                if (null !== $cardId) {
                    $orderLine->setCard($this->entityManager->getReference(Card::class, Uuid::fromString($cardId)));
                    ++$cardsLinked;
                }
                $order->addLine($orderLine);
            }

            $this->entityManager->persist($order);
            $existingRefs[$candidate['reference']] = true;
            ++$imported;

            if (0 === $imported % 50) {
                $this->entityManager->flush();
            }
        }

        if (!$dryRun && $imported > 0) {
            $this->entityManager->flush();
        }

        // Repair earlier imports that stored names only (no catalog link → no art).
        $relinked = 0;
        if (!$dryRun) {
            $relinked = $this->relinkMissingCards($store)['linked'];
        }

        return [
            'imported' => $imported,
            'skipped' => $skipped,
            'matchedUsers' => count($matchedEmails),
            'matchedOrders' => $matchedOrders,
            'cardsLinked' => $cardsLinked + $relinked,
            'dryRun' => $dryRun,
            'storeSlug' => (string) $store->getSlug(),
            'errors' => $errors,
            'warnings' => array_slice($warnings, 0, 100),
        ];
    }

    /**
     * Attach catalog cards to historical order lines that only have a name,
     * so customer history can show Scryfall/TCGCSV art.
     *
     * @return array{examined: int, linked: int, unmatched: int, samples: list<string>}
     */
    public function relinkMissingCards(Store $store): array
    {
        if (\function_exists('set_time_limit')) {
            @set_time_limit(300);
        }

        $this->cardResolveCache = [];

        /** @var list<int|string> $ids */
        $ids = $this->entityManager->createQueryBuilder()
            ->select('line.id')
            ->from(OrderLine::class, 'line')
            ->join('line.parentOrder', 'o')
            ->andWhere('o.store = :store')
            ->andWhere('line.card IS NULL')
            ->setParameter('store', $store)
            ->getQuery()
            ->getSingleColumnResult();

        $linked = 0;
        $unmatched = 0;
        $samples = [];

        foreach (array_chunk(array_map('intval', $ids), 150) as $chunk) {
            if ([] === $chunk) {
                continue;
            }

            /** @var list<OrderLine> $lines */
            $lines = $this->entityManager->createQueryBuilder()
                ->select('line')
                ->from(OrderLine::class, 'line')
                ->andWhere('line.id IN (:ids)')
                ->setParameter('ids', $chunk)
                ->getQuery()
                ->getResult();

            foreach ($lines as $line) {
                $cardId = $this->resolveCardIdFromLineLabel($line->getCardName());
                if (null === $cardId) {
                    ++$unmatched;
                    if (count($samples) < 8) {
                        $samples[] = $line->getCardName();
                    }
                    continue;
                }

                $line->setCard($this->entityManager->getReference(Card::class, Uuid::fromString($cardId)));
                $line->setCardName($this->displayLabelForCardId($cardId, $line->getCardName()));
                ++$linked;
            }

            $this->entityManager->flush();
            $this->entityManager->clear();
        }

        return [
            'examined' => count($ids),
            'linked' => $linked,
            'unmatched' => $unmatched,
            'samples' => $samples,
        ];
    }

    private function displayLabelForCardId(string $cardId, string $original): string
    {
        $row = $this->entityManager->createQueryBuilder()
            ->select('c.name AS name', 'c.setCode AS setCode')
            ->from(Card::class, 'c')
            ->andWhere('c.id = :id')
            ->setParameter('id', Uuid::fromString($cardId))
            ->getQuery()
            ->getOneOrNullResult();

        if (!\is_array($row) || '' === trim((string) ($row['name'] ?? ''))) {
            return mb_substr($this->cleanCardName($original), 0, 255);
        }

        $name = trim((string) $row['name']);
        $set = strtolower(trim((string) ($row['setCode'] ?? '')));
        if ('' !== $set) {
            return mb_substr(sprintf('%s (%s)', $name, $set), 0, 255);
        }

        return mb_substr($name, 0, 255);
    }

    private function resolveCardIdFromLineLabel(string $label): ?string
    {
        $label = trim($label);
        if ('' === $label || str_starts_with($label, 'Imported order')) {
            return null;
        }
        if (array_key_exists($label, $this->cardResolveCache)) {
            return $this->cardResolveCache[$label];
        }

        [$name, $setCode] = $this->parseLineLabel($label);
        if ('' === $name) {
            $this->cardResolveCache[$label] = null;

            return null;
        }

        $cardId = $this->cards->findIdByNameAndSetCode($name, $setCode);
        $this->cardResolveCache[$label] = $cardId;

        return $cardId;
    }

    /**
     * Legacy CSV labels look like:
     *   "Torbran, Thane of Red Fell (eld) (Rare) - Legendary"
     *   "Counterspell (cmm) (Common) - Borderless, Inverted, Full Art"
     *   "Temple Garden (Lorwyn Eclipsed) (Rare)"
     *
     * @return array{0: string, 1: string|null} [oracle-ish name, set code or null]
     */
    private function parseLineLabel(string $label): array
    {
        $cleaned = $this->cleanCardName($label);
        if ('' === $cleaned) {
            return ['', null];
        }

        // Short alphanumeric set code: "Name (mh3)"
        if (preg_match('/^(.+?)\s+\(([a-z0-9]{2,6})\)$/iu', $cleaned, $m)) {
            return [trim($m[1]), strtolower(trim($m[2]))];
        }

        // Longer parenthetical is usually a set *name*, not a code — strip it.
        if (preg_match('/^(.+?)\s+\(([^)]+)\)$/u', $cleaned, $m)) {
            return [trim($m[1]), null];
        }

        return [$cleaned, null];
    }

    /**
     * @param list<string> $warnings
     *
     * @return list<array{cardName: string, quantity: int, priceCents: int}>
     */
    private function parseItems(string $items, int $totalCents, array &$warnings): array
    {
        $items = trim($items);
        if ('' === $items) {
            $warnings[] = 'Items column was empty — imported as a single placeholder line.';

            return [[
                'cardName' => 'Imported order (line details unavailable)',
                'quantity' => 1,
                'priceCents' => max(0, $totalCents),
            ]];
        }

        $chunks = preg_split('/\s*;\s*/', $items) ?: [];
        $parsed = [];
        $skippedZero = 0;
        foreach ($chunks as $chunk) {
            $chunk = trim($chunk);
            if ('' === $chunk) {
                continue;
            }
            if (preg_match('/^(\d+)\s*x\s+(.+)$/iu', $chunk, $m)) {
                $qty = (int) $m[1];
                $name = trim($m[2]);
            } else {
                $qty = 1;
                $name = $chunk;
            }
            if ($qty < 1) {
                ++$skippedZero;
                continue;
            }
            if ('' === $name) {
                continue;
            }
            $parsed[] = [
                'cardName' => mb_substr($this->cleanCardName($name), 0, 255),
                'quantity' => $qty,
                'priceCents' => 0,
            ];
        }
        if ($skippedZero > 0) {
            $warnings[] = sprintf('Skipped %d zero-quantity item line(s).', $skippedZero);
        }
        if ([] === $parsed) {
            $warnings[] = 'No usable item lines — imported as a single placeholder line.';

            return [[
                'cardName' => 'Imported order (line details unavailable)',
                'quantity' => 1,
                'priceCents' => max(0, $totalCents),
            ]];
        }

        $unitCount = array_sum(array_column($parsed, 'quantity'));
        if ($unitCount < 1) {
            return [];
        }

        // Distribute order total across units as per-unit prices so qty × price ≈ total.
        $allocated = 0;
        $last = count($parsed) - 1;
        foreach ($parsed as $i => &$line) {
            if ($i === $last) {
                $remaining = max(0, $totalCents - $allocated);
                $line['priceCents'] = intdiv($remaining, max(1, $line['quantity']));
            } else {
                $share = (int) floor(($totalCents * $line['quantity']) / $unitCount);
                $line['priceCents'] = intdiv($share, max(1, $line['quantity']));
                $allocated += $line['priceCents'] * $line['quantity'];
            }
        }
        unset($line);

        return $parsed;
    }

    private function cleanCardName(string $name): string
    {
        // Drop treatment / type fluff after a hyphen: " - Legendary",
        // " - Borderless, Inverted, Full Art, Booster Fun"
        $cleaned = preg_replace('/\s+-\s+.+$/u', '', $name) ?? $name;
        // Drop trailing rarity token: "(Rare)", "(Mythic Rare)", "(common)"
        $cleaned = preg_replace('/\s*\((?:Common|Uncommon|Rare|Mythic(?:\s+Rare)?|Special|Promo|Token|Land)\)\s*$/iu', '', $cleaned) ?? $cleaned;

        return trim($cleaned);
    }

    private function paidCentsFor(OrderStatus $status, int $totalCents, int $taxCents, string $paymentStatus): int
    {
        if (OrderStatus::CANCELLED === $status || OrderStatus::PENDING === $status) {
            return 0;
        }
        if ($this->isUnpaidPaymentStatus($paymentStatus)) {
            return 0;
        }

        // Match amountDueCents() (merchandise + tax) so imported rows don't
        // start life with a phantom balance when tax is present.
        return max(0, $totalCents + $taxCents);
    }

    private function isUnpaidPaymentStatus(string $raw): bool
    {
        $key = strtolower(trim($raw));
        if ('' === $key) {
            return false;
        }

        return in_array($key, [
            'due at pickup',
            'unpaid',
            'owing',
            'pay in store',
            'paying in store',
            'awaiting payment',
            'pending payment',
        ], true);
    }

    private function mapStatus(string $raw): ?OrderStatus
    {
        $key = strtolower(trim($raw));

        return match ($key) {
            'delivered', 'completed', 'complete' => OrderStatus::COMPLETED,
            'cancelled', 'canceled' => OrderStatus::CANCELLED,
            'partially refunded', 'refunded', 'partial refund' => OrderStatus::REFUNDED,
            'pending', 'open' => OrderStatus::PENDING,
            'ready for pickup', 'fulfilled', 'ready' => OrderStatus::FULFILLED,
            'shipped' => OrderStatus::SHIPPED,
            'paid', 'received' => OrderStatus::PAID,
            default => null,
        };
    }

    private function mapChannel(string $raw): string
    {
        $key = strtolower(trim($raw));

        return match (true) {
            '' === $key,
            str_contains($key, 'online'),
            str_contains($key, 'web'),
            str_contains($key, 'storefront') => Order::CHANNEL_ONLINE,
            str_contains($key, 'kiosk'),
            str_contains($key, 'pos'),
            str_contains($key, 'in-store'),
            str_contains($key, 'instore') => Order::CHANNEL_KIOSK,
            // Unknown values default to online (shopper checkout), not kiosk.
            default => Order::CHANNEL_ONLINE,
        };
    }

    private function mapFulfillment(string $raw): string
    {
        $key = strtolower(trim($raw));

        return match (true) {
            str_contains($key, 'ship'),
            str_contains($key, 'mail'),
            str_contains($key, 'delivery') => Order::FULFILLMENT_SHIPPING,
            default => Order::FULFILLMENT_PICKUP,
        };
    }

    private function normalizeReference(string $raw): ?string
    {
        $ref = preg_replace('/\s+/', '', trim($raw)) ?? '';
        if ('' === $ref) {
            return null;
        }
        if (mb_strlen($ref) <= 32) {
            return $ref;
        }

        $prefix = mb_substr($ref, 0, 20);
        $suffix = substr(hash('sha256', $ref), 0, 11);

        return $prefix.'-'.$suffix;
    }

    private function parseDate(string $raw): ?\DateTimeImmutable
    {
        $raw = trim($raw);
        if ('' === $raw) {
            return null;
        }
        foreach (['Y-m-d', 'Y-m-d H:i:s', 'm/d/Y', 'n/j/Y', 'm/d/Y H:i', 'Y/m/d'] as $format) {
            $dt = \DateTimeImmutable::createFromFormat('!'.$format, $raw);
            if ($dt instanceof \DateTimeImmutable) {
                return $dt;
            }
        }
        try {
            return new \DateTimeImmutable($raw);
        } catch (\Exception) {
            return null;
        }
    }

    private function dollarsToCents(string $raw): ?int
    {
        $raw = trim(str_replace([',', '$'], '', $raw));
        if ('' === $raw) {
            return 0;
        }
        if (!is_numeric($raw)) {
            return null;
        }

        return (int) round(((float) $raw) * 100);
    }

    private function buildNotes(
        string $paymentStatus,
        string $tracking,
        string $address,
        string $refunded,
        string $legacyId,
    ): ?string {
        $parts = [sprintf('%s order %s', Order::NOTE_IMPORTED_PREFIX, $legacyId)];
        if ('' !== $paymentStatus) {
            $parts[] = 'Payment: '.$paymentStatus;
        }
        if ('' !== $refunded && '0' !== $refunded && '0.00' !== $refunded) {
            $parts[] = 'Refunded: $'.$refunded;
        }
        if ('' !== $tracking) {
            $parts[] = 'Tracking: '.$tracking;
        }
        if ('' !== $address) {
            $parts[] = 'Ship to: '.$address;
        }
        $notes = implode(' · ', $parts);

        return mb_substr($notes, 0, 255);
    }

    /**
     * @param list<string> $references
     *
     * @return array<string, true>
     */
    private function existingReferences(array $references): array
    {
        $found = [];
        foreach (array_chunk(array_values(array_unique($references)), 500) as $chunk) {
            if ([] === $chunk) {
                continue;
            }
            $rows = $this->orders->createQueryBuilder('o')
                ->select('o.reference')
                ->andWhere('o.reference IN (:refs)')
                ->setParameter('refs', $chunk)
                ->getQuery()
                ->getSingleColumnResult();
            foreach ($rows as $ref) {
                $found[(string) $ref] = true;
            }
        }

        return $found;
    }

    /**
     * @param list<string> $emails
     *
     * @return array<string, true>
     */
    private function existingEmails(array $emails): array
    {
        $found = [];
        $normalized = array_values(array_unique(array_map(static fn (string $e): string => mb_strtolower($e), $emails)));
        foreach (array_chunk($normalized, 500) as $chunk) {
            if ([] === $chunk) {
                continue;
            }
            $rows = $this->users->createQueryBuilder('u')
                ->select('LOWER(u.email)')
                ->andWhere('LOWER(u.email) IN (:emails)')
                ->setParameter('emails', $chunk)
                ->getQuery()
                ->getSingleColumnResult();
            foreach ($rows as $email) {
                $found[(string) $email] = true;
            }
        }

        return $found;
    }

    /**
     * @param list<string> $header
     *
     * @return array<string, int>
     */
    private function headerIndex(array $header): array
    {
        $index = [];
        foreach ($header as $i => $label) {
            $normalized = strtolower(preg_replace('/[^a-z0-9]+/i', '', (string) $label) ?? '');
            $key = self::HEADER_ALIASES[$normalized] ?? null;
            if (null !== $key && !isset($index[$key])) {
                $index[$key] = $i;
            }
        }

        return $index;
    }

    private function decodeCsvBytes(string $csv): string
    {
        if (str_starts_with($csv, "\xEF\xBB\xBF")) {
            $csv = substr($csv, 3);
        }
        if (str_starts_with($csv, "\xFF\xFE") || str_starts_with($csv, "\xFE\xFF")) {
            $converted = mb_convert_encoding($csv, 'UTF-8', 'UTF-16');
            if (is_string($converted)) {
                return $converted;
            }
        }

        return $csv;
    }
}
