<?php

namespace App\Service\Tcgcsv;

use App\Entity\Card;
use App\Entity\Game;
use App\Entity\GameSet;
use App\Entity\SealedProduct;
use App\Repository\CardRepository;
use App\Repository\GameSetRepository;
use App\Repository\SealedProductRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Mirrors one game's TCGCSV catalog into the local database:
 *
 *  - every TCGCSV group becomes a GameSet (all games — sealed needs them);
 *  - products WITH an extendedData "Number" are cards. For non-MTG games
 *    they are upserted as Card rows with deterministic UUIDs; Magic singles
 *    are skipped because Scryfall remains their source of truth;
 *  - products WITHOUT a "Number" are sealed (boxes, bundles, decks, …) and
 *    are upserted as SealedProduct rows for every game, MTG included;
 *  - the daily price file fills Card::$prices (usd / usd_foil) for non-MTG
 *    cards and the market/low cents snapshot on sealed products.
 *
 * Re-running is idempotent: rows are matched on their preserved TCGplayer
 * identifiers (group id, product id) and updated in place.
 */
final readonly class CatalogSynchronizer
{
    /**
     * Fixed namespace for Uuid::v5 so a TCGplayer product id always maps to
     * the same Card primary key across runs and environments.
     */
    private const CARD_UUID_NAMESPACE = 'c7bfb4b8-53f6-4e34-9f0d-2ac2f0a6dd91';

    public function __construct(
        private TcgcsvClient $tcgcsvClient,
        private EntityManagerInterface $entityManager,
        private GameSetRepository $gameSetRepository,
        private SealedProductRepository $sealedProductRepository,
        private CardRepository $cardRepository,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * Builds the deterministic Card id for a TCGplayer product. Public so
     * tests and future import tooling can compute the same identity.
     */
    public static function cardIdForProduct(int $productId): Uuid
    {
        return Uuid::v5(Uuid::fromString(self::CARD_UUID_NAMESPACE), 'tcgcsv-product-'.$productId);
    }

    /**
     * Synchronizes the full TCGCSV catalog for one game.
     *
     * @return array<string, int> counters for the sync-run summary
     */
    public function sync(Game $game): array
    {
        $categoryId = $game->getTcgcsvCategoryId();
        if (null === $categoryId) {
            throw new \InvalidArgumentException(sprintf('Game "%s" has no TCGCSV category id; it cannot be synced.', $game->getCode()));
        }

        $counters = [
            'groupsSeen' => 0,
            'setsCreated' => 0,
            'setsUpdated' => 0,
            'cardsUpserted' => 0,
            'sealedUpserted' => 0,
        ];

        foreach ($this->tcgcsvClient->fetchGroups($categoryId) as $group) {
            $groupId = (int) ($group['groupId'] ?? 0);
            if ($groupId <= 0) {
                continue;
            }

            ++$counters['groupsSeen'];
            $set = $this->upsertSet($game, $groupId, $group, $counters);

            $products = $this->tcgcsvClient->fetchProducts($categoryId, $groupId);
            $prices = $this->indexPrices($this->tcgcsvClient->fetchPrices($categoryId, $groupId));

            $this->syncGroupProducts($game, $set, $products, $prices, $counters);

            // Flush per group: bounds memory and makes partial progress
            // durable if a later group's fetch fails mid-run.
            $this->entityManager->flush();
        }

        $this->logger->info('TCGCSV sync finished for {game}.', ['game' => $game->getCode()] + $counters);

        return $counters;
    }

    /** @param array<string, mixed> $group */
    private function upsertSet(Game $game, int $groupId, array $group, array &$counters): GameSet
    {
        $set = $this->gameSetRepository->findOneByTcgcsvGroupId($groupId);
        if (!$set instanceof GameSet) {
            $set = new GameSet();
            $set->setGame($game);
            $set->setTcgcsvGroupId($groupId);
            $this->entityManager->persist($set);
            ++$counters['setsCreated'];
        } else {
            ++$counters['setsUpdated'];
        }

        $set->setName(is_string($group['name'] ?? null) ? $group['name'] : 'Group '.$groupId);

        $abbreviation = $group['abbreviation'] ?? null;
        $set->setCode(is_string($abbreviation) && '' !== trim($abbreviation) ? mb_substr(trim($abbreviation), 0, 40) : null);

        $publishedOn = $group['publishedOn'] ?? null;
        if (is_string($publishedOn) && '' !== $publishedOn) {
            try {
                $set->setReleaseDate(new \DateTimeImmutable($publishedOn));
            } catch (\Exception) {
                // Unparseable date: keep whatever we had.
            }
        }

        return $set->touch();
    }

    /**
     * @param list<array<string, mixed>>                       $products
     * @param array<int, array<string, array<string, mixed>>>  $prices   productId => subTypeName => price row
     * @param array<string, int>                               $counters
     */
    private function syncGroupProducts(Game $game, GameSet $set, array $products, array $prices, array &$counters): void
    {
        // Preload existing rows for this group in two queries instead of one
        // SELECT per product.
        $productIds = [];
        foreach ($products as $product) {
            $productId = (int) ($product['productId'] ?? 0);
            if ($productId > 0) {
                $productIds[] = $productId;
            }
        }
        if ([] === $productIds) {
            return;
        }

        /** @var array<int, SealedProduct> $sealedByProductId */
        $sealedByProductId = [];
        foreach ($this->sealedProductRepository->findBy(['tcgcsvProductId' => array_map(strval(...), $productIds)]) as $sealed) {
            $sealedByProductId[$sealed->getTcgcsvProductId()] = $sealed;
        }

        /** @var array<string, Card> $cardsById */
        $cardsById = [];
        if (!$game->isMtg()) {
            $ids = array_map(static fn (int $productId): Uuid => self::cardIdForProduct($productId), $productIds);
            foreach ($this->cardRepository->findBy(['id' => $ids]) as $card) {
                $cardsById[$card->getId()->toRfc4122()] = $card;
            }
        }

        foreach ($products as $product) {
            $productId = (int) ($product['productId'] ?? 0);
            if ($productId <= 0) {
                continue;
            }

            $extended = $this->indexExtendedData($product);
            $productPrices = $prices[$productId] ?? [];

            // TCGplayer marks singles with a collector "Number"; sealed
            // products never carry one. This is the card/sealed split.
            if (isset($extended['number'])) {
                if (!$game->isMtg()) {
                    $this->upsertCard($game, $set, $productId, $product, $extended, $productPrices, $cardsById);
                    ++$counters['cardsUpserted'];
                }
                continue;
            }

            $this->upsertSealed($game, $set, $productId, $product, $productPrices, $sealedByProductId);
            ++$counters['sealedUpserted'];
        }
    }

    /**
     * @param array<string, mixed>                $product
     * @param array<string, string>               $extended
     * @param array<string, array<string, mixed>> $productPrices subTypeName => price row
     * @param array<string, Card>                 $cardsById
     */
    private function upsertCard(Game $game, GameSet $set, int $productId, array $product, array $extended, array $productPrices, array $cardsById): void
    {
        $id = self::cardIdForProduct($productId);
        $card = $cardsById[$id->toRfc4122()] ?? null;

        if (!$card instanceof Card) {
            $card = new Card($id);
            // TCGCSV has no oracle identity; each printing is its own card.
            $card->setOracleId($id);
            $this->entityManager->persist($card);
        }

        $card->setGame($game);
        $card->setGameSet($set);
        $card->setTcgplayerProductId($productId);
        $card->setName($this->stringValue($product, 'name') ?? 'Product '.$productId);
        $card->setSetCode(mb_substr($set->getCode() ?? ('tcg-'.$set->getTcgcsvGroupId()), 0, 40));
        $card->setSetName($set->getName());
        $card->setCollectorNumber(mb_substr($extended['number'] ?? (string) $productId, 0, 20));
        $card->setRarity(isset($extended['rarity']) ? mb_substr($extended['rarity'], 0, 20) : null);

        if (isset($extended['cardtype'])) {
            $card->setTypeLine(mb_substr($extended['cardtype'], 0, 255));
        }
        $text = $extended['cardtext'] ?? $extended['description'] ?? null;
        if (null !== $text) {
            $card->setOracleText($text);
        }
        if (isset($extended['power'])) {
            $card->setPower(mb_substr($extended['power'], 0, 16));
        }

        $imageUrl = $this->stringValue($product, 'imageUrl');
        if (null !== $imageUrl) {
            $card->setImageUris(['normal' => $imageUrl, 'small' => $imageUrl]);
        }
        $card->setScryfallUri($this->stringValue($product, 'url'));

        // Store prices Scryfall-shaped so every downstream consumer
        // (inventory pricing, buylist, market price resolver) just works.
        $usd = $this->marketPrice($productPrices, 'Normal');
        $usdFoil = $this->marketPrice($productPrices, 'Foil');
        if (null !== $usd || null !== $usdFoil) {
            $card->setPrices(array_filter([
                'usd' => $usd,
                'usd_foil' => $usdFoil,
            ], static fn (?string $value): bool => null !== $value));
        }
    }

    /**
     * @param array<string, mixed>                $product
     * @param array<string, array<string, mixed>> $productPrices  subTypeName => price row
     * @param array<int, SealedProduct>           $sealedByProductId
     */
    private function upsertSealed(Game $game, GameSet $set, int $productId, array $product, array $productPrices, array $sealedByProductId): void
    {
        $sealed = $sealedByProductId[$productId] ?? null;
        if (!$sealed instanceof SealedProduct) {
            $sealed = new SealedProduct();
            $sealed->setTcgcsvProductId($productId);
            $this->entityManager->persist($sealed);
        }

        $sealed->setGame($game);
        $sealed->setGameSet($set);
        $sealed->setName(mb_substr($this->stringValue($product, 'name') ?? 'Product '.$productId, 0, 255));
        $sealed->setImageUrl($this->stringValue($product, 'imageUrl'));
        $sealed->setUrl($this->stringValue($product, 'url'));

        // Sealed products are printed once; pricing rides the Normal subtype.
        $row = $productPrices['Normal'] ?? (reset($productPrices) ?: null);
        if (is_array($row)) {
            $sealed->setMarketPriceCents($this->toCents($row['marketPrice'] ?? null));
            $sealed->setLowPriceCents($this->toCents($row['lowPrice'] ?? null));
        }

        $sealed->touch();
    }

    /**
     * @param list<array<string, mixed>> $priceRows
     *
     * @return array<int, array<string, array<string, mixed>>> productId => subTypeName => row
     */
    private function indexPrices(array $priceRows): array
    {
        $indexed = [];
        foreach ($priceRows as $row) {
            $productId = (int) ($row['productId'] ?? 0);
            $subType = $row['subTypeName'] ?? null;
            if ($productId <= 0 || !is_string($subType)) {
                continue;
            }
            $indexed[$productId][$subType] = $row;
        }

        return $indexed;
    }

    /**
     * Flattens extendedData ([{name, value}, …]) into a lowercase-keyed map.
     *
     * @param array<string, mixed> $product
     *
     * @return array<string, string>
     */
    private function indexExtendedData(array $product): array
    {
        $extended = [];
        foreach (is_array($product['extendedData'] ?? null) ? $product['extendedData'] : [] as $entry) {
            if (!is_array($entry) || !is_string($entry['name'] ?? null)) {
                continue;
            }
            $value = $entry['value'] ?? null;
            if (is_string($value) || is_numeric($value)) {
                $extended[strtolower(str_replace(' ', '', $entry['name']))] = (string) $value;
            }
        }

        return $extended;
    }

    /** @param array<string, array<string, mixed>> $productPrices */
    private function marketPrice(array $productPrices, string $subType): ?string
    {
        $value = $productPrices[$subType]['marketPrice'] ?? null;

        return is_numeric($value) && (float) $value > 0 ? number_format((float) $value, 2, '.', '') : null;
    }

    private function toCents(mixed $value): ?int
    {
        return is_numeric($value) && (float) $value > 0 ? (int) round((float) $value * 100) : null;
    }

    /** @param array<string, mixed> $data */
    private function stringValue(array $data, string $key): ?string
    {
        $value = $data[$key] ?? null;

        return is_string($value) && '' !== trim($value) ? trim($value) : null;
    }
}
