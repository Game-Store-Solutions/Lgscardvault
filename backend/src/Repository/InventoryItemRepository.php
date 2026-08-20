<?php

namespace App\Repository;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Game;
use App\Entity\Store;
use App\Service\Catalog\ArtistCredits;
use App\Service\Catalog\FinishVocabulary;
use App\Service\Inventory\InventoryCatalogFilters;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<InventoryItem>
 */
class InventoryItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, InventoryItem::class);
    }

    /**
     * One page of a store's inventory, card eagerly joined. Ordered by card
     * name with the item id as a stable tiebreaker so LIMIT/OFFSET pages
     * never overlap or skip rows when many printings share a name.
     *
     * @return list<InventoryItem>
     */
    public function findPageByStore(
        Store $store,
        int $offset,
        int $limit,
        ?string $gameCode = null,
        bool $inStockOnly = false,
    ): array {
        return $this->findCatalogPage(
            $store,
            $offset,
            $limit,
            $gameCode,
            $inStockOnly,
            new InventoryCatalogFilters(),
        );
    }

    /**
     * One page of listings matching storefront/admin catalog filters.
     *
     * @return list<InventoryItem>
     */
    public function findCatalogPage(
        Store $store,
        int $offset,
        int $limit,
        ?string $gameCode,
        bool $inStockOnly,
        InventoryCatalogFilters $filters,
    ): array {
        $qb = $this->listingQuery($store, $inStockOnly, $gameCode);
        $this->applyCatalogFilters($qb, $filters);
        $this->applyCatalogSort($qb, $filters->sort);

        return $qb->setFirstResult($offset)->setMaxResults($limit)->getQuery()->getResult();
    }

    public function countCatalog(
        Store $store,
        ?string $gameCode,
        bool $inStockOnly,
        InventoryCatalogFilters $filters,
    ): int {
        $qb = $this->createQueryBuilder('i')
            ->select('COUNT(i.id)')
            ->andWhere('i.store = :store')
            ->setParameter('store', $store)
            ->join('i.card', 'c');

        if ($inStockOnly) {
            $qb->andWhere('i.quantity > 0');
        }
        if (null !== $gameCode && '' !== $gameCode) {
            $this->scopeToGame($qb, $gameCode);
        }
        $this->applyCatalogFilters($qb, $filters);

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    /**
     * Distinct in-stock sets for the set dropdown — cheap even at 18k listings.
     *
     * @return list<array{code: string, name: string}>
     */
    public function findCatalogSets(Store $store, ?string $gameCode, bool $inStockOnly): array
    {
        $qb = $this->createQueryBuilder('i')
            ->select('c.setCode AS code', 'MAX(c.setName) AS name')
            ->join('i.card', 'c')
            ->andWhere('i.store = :store')
            ->setParameter('store', $store)
            ->groupBy('c.setCode')
            ->orderBy('name', 'ASC');

        if ($inStockOnly) {
            $qb->andWhere('i.quantity > 0');
        }
        if (null !== $gameCode && '' !== $gameCode) {
            $this->scopeToGame($qb, $gameCode);
        }

        $rows = $qb->getQuery()->getScalarResult();
        $sets = [];
        foreach ($rows as $row) {
            $code = (string) $row['code'];
            if ('' === $code) {
                continue;
            }
            $sets[] = [
                'code' => $code,
                'name' => '' !== (string) $row['name'] ? (string) $row['name'] : strtoupper($code),
            ];
        }

        return $sets;
    }

    public function countByStore(Store $store, ?string $gameCode = null, bool $inStockOnly = false): int
    {
        $qb = $this->createQueryBuilder('i')
            ->select('COUNT(i.id)')
            ->andWhere('i.store = :store')
            ->setParameter('store', $store);

        if ($inStockOnly) {
            $qb->andWhere('i.quantity > 0');
        }

        if (null !== $gameCode && '' !== $gameCode) {
            $qb->join('i.card', 'c');
            $this->scopeToGame($qb, $gameCode);
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    /**
     * Headline numbers for one game's singles in a store: how many distinct
     * listings, and how many physical copies they represent.
     *
     * @return array{listings: int, copies: int}
     */
    public function statsForGame(Store $store, string $gameCode, bool $inStockOnly = false): array
    {
        $qb = $this->createQueryBuilder('i')
            ->select('COUNT(i.id) AS listings', 'COALESCE(SUM(i.quantity), 0) AS copies')
            ->join('i.card', 'c')
            ->andWhere('i.store = :store')
            ->setParameter('store', $store);

        if ($inStockOnly) {
            $qb->andWhere('i.quantity > 0');
        }

        $this->scopeToGame($qb, $gameCode);

        $row = $qb->getQuery()->getSingleResult();

        return ['listings' => (int) $row['listings'], 'copies' => (int) $row['copies']];
    }

    /**
     * Game codes a store actually stocks, so the storefront only offers game
     * tabs that lead somewhere. Legacy NULL-game listings report as Magic.
     *
     * @return list<string>
     */
    public function findStockedGameCodes(Store $store): array
    {
        $rows = $this->createQueryBuilder('i')
            ->select('COALESCE(g.code, :mtg) AS code')
            ->distinct()
            ->join('i.card', 'c')
            ->leftJoin('c.game', 'g')
            ->andWhere('i.store = :store')
            ->andWhere('i.quantity > 0')
            ->setParameter('store', $store)
            ->setParameter('mtg', Game::CODE_MTG)
            ->getQuery()
            ->getScalarResult();

        return array_values(array_filter(array_map(static fn (array $row): string => (string) $row['code'], $rows)));
    }

    /**
     * Keyset (cursor) page: items with id > $afterId, ascending. Backed by
     * idx_inventory_store_id_id, each page is an O(page-size) index range
     * scan — unlike OFFSET pages, walking the whole inventory is linear, and
     * because the cursor is an immutable id, concurrent inserts/deletes can
     * never shift rows into (duplicate) or out of (skip) later pages.
     *
     * @return list<InventoryItem>
     */
    public function findByStoreAfterId(
        Store $store,
        int $afterId,
        int $limit,
        ?string $gameCode = null,
        bool $inStockOnly = false,
    ): array {
        $qb = $this->listingQuery($store, $inStockOnly, $gameCode)
            ->andWhere('i.id > :afterId')
            ->setParameter('afterId', $afterId)
            ->orderBy('i.id', 'ASC')
            ->setMaxResults($limit);

        return $qb->getQuery()->getResult();
    }

    /**
     * Shared listing query: card + game are eager so serializing `gameCode`
     * never N+1s a 500-row page (18k listings × one Game SELECT each is what
     * made the storefront crawl after a large import).
     */
    private function listingQuery(Store $store, bool $inStockOnly, ?string $gameCode): QueryBuilder
    {
        $qb = $this->createQueryBuilder('i')
            ->andWhere('i.store = :store')
            ->setParameter('store', $store)
            ->join('i.card', 'c')
            ->addSelect('c')
            ->leftJoin('c.game', 'g')
            ->addSelect('g');

        if ($inStockOnly) {
            $qb->andWhere('i.quantity > 0');
        }

        if (null !== $gameCode && '' !== $gameCode) {
            $this->scopeToGame($qb, $gameCode);
        }

        return $qb;
    }

    private function applyCatalogFilters(QueryBuilder $qb, InventoryCatalogFilters $filters): void
    {
        if ('' !== $filters->q) {
            $qb->andWhere(
                'LOWER(c.name) LIKE :q OR LOWER(c.setCode) LIKE :q OR LOWER(COALESCE(c.setName, :empty)) LIKE :q OR LOWER(COALESCE(c.typeLine, :empty)) LIKE :q',
            )
                ->setParameter('q', '%'.mb_strtolower($filters->q).'%')
                ->setParameter('empty', '');
        }

        if ('' !== $filters->set) {
            $set = mb_strtolower($filters->set);
            $qb->andWhere('LOWER(c.setCode) = :setExact OR LOWER(COALESCE(c.setName, :emptySet)) LIKE :setLike')
                ->setParameter('setExact', $set)
                ->setParameter('setLike', '%'.$set.'%')
                ->setParameter('emptySet', '');
        }

        if ('' !== $filters->artist) {
            $this->constrainArtist($qb, $filters->artist);
        }

        if ('' !== $filters->type) {
            $qb->andWhere('LOWER(COALESCE(c.typeLine, :emptyType)) LIKE :type')
                ->setParameter('type', '%'.mb_strtolower($filters->type).'%')
                ->setParameter('emptyType', '');
        }

        $this->applyFinishFilter($qb, $filters->finish);
        $this->applyColorFilter($qb, $filters->colors);

        if (null !== $filters->minPriceCents) {
            $qb->andWhere('i.priceCents >= :minPrice')->setParameter('minPrice', $filters->minPriceCents);
        }
        if (null !== $filters->maxPriceCents) {
            $qb->andWhere('i.priceCents <= :maxPrice')->setParameter('maxPrice', $filters->maxPriceCents);
        }
    }

    /**
     * Exact artist match via the artist_credits JSONB array (top-level credit
     * plus each face). Scanning CAST(scryfall_data AS TEXT) LIKE was what made
     * storefront artist pages sequential-scan every listing.
     */
    private function constrainArtist(QueryBuilder $qb, string $artist): void
    {
        $param = ArtistCredits::containsParam($artist);
        if (null === $param) {
            $qb->andWhere('1 = 0');

            return;
        }

        $qb->andWhere('JSONB_CONTAINS(c.artistCredits, :artistCredit)')
            ->setParameter('artistCredit', $param);
    }

    private function applyFinishFilter(QueryBuilder $qb, string $finish): void
    {
        if ('all' === $finish) {
            return;
        }

        $markers = ['%foil%', '%holo%', '%prism%', '%rainbow%', '%etched%', '%shatter%', '%galaxy%', '%gilded%'];
        $likes = [];
        foreach ($markers as $i => $marker) {
            $likes[] = 'LOWER(i.finish) LIKE :foilMarker'.$i;
            $qb->setParameter('foilMarker'.$i, $marker);
        }

        $foil = "LOWER(i.finish) NOT LIKE 'non%' AND LOWER(i.finish) NOT IN (:plainFinishes) AND (".implode(' OR ', $likes).')';
        $qb->setParameter('plainFinishes', ['normal', 'unlimited', 'unlimited edition', '1st edition']);

        if ('foil' === $finish) {
            $qb->andWhere($foil);
        } else {
            $qb->andWhere('NOT ('.$foil.')');
        }
    }

    /** @param list<string> $colors */
    private function applyColorFilter(QueryBuilder $qb, array $colors): void
    {
        if ([] === $colors) {
            return;
        }

        // PostgreSQL has no `json = json` operator, and DQL has no CAST.
        // Exact identity is "has each requested pip and none of the others".
        $wanted = ['C'] === $colors ? [] : $colors;
        foreach (['W', 'U', 'B', 'R', 'G'] as $letter) {
            $param = 'colorPip'.$letter;
            if (in_array($letter, $wanted, true)) {
                $qb->andWhere('CAST_AS_TEXT(c.colorIdentity) LIKE :'.$param)
                    ->setParameter($param, '%"'.$letter.'"%');
            } else {
                $qb->andWhere('c.colorIdentity IS NULL OR CAST_AS_TEXT(c.colorIdentity) NOT LIKE :'.$param)
                    ->setParameter($param, '%"'.$letter.'"%');
            }
        }
    }

    private function applyCatalogSort(QueryBuilder $qb, string $sort): void
    {
        match ($sort) {
            'price-desc' => $qb->orderBy('i.priceCents', 'DESC')->addOrderBy('c.name', 'ASC')->addOrderBy('i.id', 'ASC'),
            'price-asc' => $qb->orderBy('i.priceCents', 'ASC')->addOrderBy('c.name', 'ASC')->addOrderBy('i.id', 'ASC'),
            'newest' => $qb->orderBy('c.releasedAt', 'DESC')->addOrderBy('i.id', 'DESC'),
            default => $qb->orderBy('c.name', 'ASC')->addOrderBy('i.id', 'ASC'),
        };
    }

    /**
     * Restricts a listing query to one game.
     *
     * Cards predating the multi-game catalog have no game row and are Magic
     * by definition, so a Magic filter must include those NULLs — otherwise
     * every legacy listing disappears the moment a store picks "Magic".
     */
    private function scopeToGame(QueryBuilder $qb, string $gameCode): void
    {
        $code = strtolower(trim($gameCode));
        if (!$this->hasJoinAlias($qb, 'g')) {
            $qb->leftJoin('c.game', 'g');
        }

        if (Game::CODE_MTG === $code) {
            $qb->andWhere('g.code = :gameCode OR c.game IS NULL');
        } else {
            $qb->andWhere('g.code = :gameCode');
        }

        $qb->setParameter('gameCode', $code);
    }

    private function hasJoinAlias(QueryBuilder $qb, string $alias): bool
    {
        foreach ($qb->getDQLPart('join') as $joins) {
            foreach ($joins as $join) {
                if ($join->getAlias() === $alias) {
                    return true;
                }
            }
        }

        return false;
    }


    /**
     * One page of candidate listings for a case section's auto-fill — in
     * stock, matching the SQL-expressible criteria (price range, rarity, set,
     * card type), highest price first. Color identity lives in a JSON column,
     * so SectionAutoFiller filters it in PHP over these batches (along with
     * cross-section allocation accounting) until it has enough matches.
     *
     * @return list<InventoryItem>
     */
    public function findAutoSectionCandidates(
        Store $store,
        ?int $minPriceCents,
        ?int $maxPriceCents,
        ?string $rarity,
        ?string $setCode,
        ?string $cardType,
        int $offset,
        int $limit,
    ): array {
        $qb = $this->createQueryBuilder('i')
            ->join('i.card', 'c')
            ->addSelect('c')
            ->andWhere('i.store = :store')
            ->andWhere('i.quantity > 0')
            ->setParameter('store', $store)
            ->orderBy('i.priceCents', 'DESC')
            ->addOrderBy('i.id', 'ASC')
            ->setFirstResult($offset)
            ->setMaxResults($limit);

        // Display-case auto-fill speaks Magic (rarity tiers, color identity,
        // Magic type lines), so only Magic listings may be auto-placed — a
        // One Piece card must never be swept into a Magic case section.
        $this->scopeToGame($qb, Game::CODE_MTG);

        if (null !== $minPriceCents) {
            $qb->andWhere('i.priceCents >= :minPrice')->setParameter('minPrice', $minPriceCents);
        }
        if (null !== $maxPriceCents) {
            $qb->andWhere('i.priceCents <= :maxPrice')->setParameter('maxPrice', $maxPriceCents);
        }
        if (null !== $rarity && '' !== $rarity) {
            $qb->andWhere('LOWER(c.rarity) = :rarity')->setParameter('rarity', strtolower($rarity));
        }
        if (null !== $setCode && '' !== $setCode) {
            $qb->andWhere('LOWER(c.setCode) = :setCode')->setParameter('setCode', strtolower($setCode));
        }
        if (null !== $cardType && '' !== $cardType) {
            $qb->andWhere('LOWER(c.typeLine) LIKE :cardType')->setParameter('cardType', '%'.strtolower($cardType).'%');
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * Listings from the pre-multi-game era: a "Game: X" note (written by the
     * old import recovery path) on an item whose card has no game row. These
     * are the rows the LegacyGameLinkRepairer re-homes.
     *
     * @return list<InventoryItem>
     */
    public function findLegacyGameNoted(): array
    {
        return $this->createQueryBuilder('i')
            ->join('i.card', 'c')
            ->addSelect('c')
            ->where('c.game IS NULL')
            ->andWhere('LOWER(i.notes) LIKE :marker')
            ->setParameter('marker', '%game:%')
            ->getQuery()
            ->getResult();
    }

    public function findOneByStoreAndId(Store $store, int $id): ?InventoryItem
    {
        return $this->createQueryBuilder('i')
            ->join('i.card', 'c')
            ->addSelect('c')
            ->andWhere('i.store = :store')
            ->andWhere('i.id = :id')
            ->setParameter('store', $store)
            ->setParameter('id', $id)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * In-stock Magic singles for a store — candidate pool for commander
     * recommendations. Card is eagerly joined; capped so a huge inventory
     * cannot blow the recommend request.
     *
     * @return list<InventoryItem>
     */
    public function findInStockMagicForStore(Store $store, int $limit = 2500): array
    {
        $qb = $this->createQueryBuilder('i')
            ->join('i.card', 'c')
            ->addSelect('c')
            ->andWhere('i.store = :store')
            ->andWhere('i.quantity > 0')
            ->setParameter('store', $store)
            ->orderBy('i.priceCents', 'ASC')
            ->addOrderBy('i.id', 'ASC')
            ->setMaxResults($limit);

        $this->scopeToGame($qb, Game::CODE_MTG);

        return $qb->getQuery()->getResult();
    }

    /**
     * Candidate pool for the commander deck builder (recommendations + 100-card
     * assembly).
     *
     * Two things distinguish this from findInStockMagicForStore():
     *  1. Color identity is filtered in SQL, so a commander only ever sees cards
     *     legal in its identity — this alone shrinks most stores below the cap.
     *  2. Rows are ordered by EDHREC rank (most-played first) rather than price,
     *     so when a large store DOES exceed the cap we keep the most relevant,
     *     impactful cards (including expensive rares/mythics and format staples)
     *     instead of the cheapest commons. Unranked cards sort last.
     *
     * @param list<string>|null $commanderColorIdentity WUBRG letters; null skips the color filter
     *
     * @return list<InventoryItem>
     */
    public function findRecommendationCandidates(
        Store $store,
        ?array $commanderColorIdentity = null,
        int $limit = 4000,
    ): array {
        $qb = $this->createQueryBuilder('i')
            ->join('i.card', 'c')
            ->addSelect('c')
            // COALESCE gives unranked cards a sentinel so they sort last (DQL
            // has no NULLS LAST); ordering by the selected HIDDEN alias keeps
            // the expression out of the hydrated result.
            ->addSelect('COALESCE(c.edhrecRank, 2147483647) AS HIDDEN edhrecSort')
            ->andWhere('i.store = :store')
            ->andWhere('i.quantity > 0')
            ->setParameter('store', $store)
            ->orderBy('edhrecSort', 'ASC')
            ->addOrderBy('i.priceCents', 'ASC')
            ->addOrderBy('i.id', 'ASC')
            ->setMaxResults($limit);

        $this->scopeToGame($qb, Game::CODE_MTG);
        $this->applyColorIdentitySubset($qb, $commanderColorIdentity);

        return $qb->getQuery()->getResult();
    }

    /**
     * Restrict a query to cards legal in a commander's color identity: a card
     * qualifies when it has no color pip outside the commander's identity
     * (colorless cards are always legal). Mirrors ColorIdentityParser::isSubsetOf()
     * in SQL so the filter runs before the candidate cap. A null identity skips
     * the filter entirely.
     *
     * @param list<string>|null $commanderColorIdentity
     */
    private function applyColorIdentitySubset(QueryBuilder $qb, ?array $commanderColorIdentity): void
    {
        if (null === $commanderColorIdentity) {
            return;
        }

        $allowed = array_map('strval', $commanderColorIdentity);
        foreach (['W', 'U', 'B', 'R', 'G'] as $letter) {
            if (in_array($letter, $allowed, true)) {
                continue;
            }
            $param = 'ciExclude'.$letter;
            $qb->andWhere('(c.colorIdentity IS NULL OR CAST_AS_TEXT(c.colorIdentity) NOT LIKE :'.$param.')')
                ->setParameter($param, '%"'.$letter.'"%');
        }
    }

    /**
     * Best storefront listing to open for a want-list row at this store.
     * Prefers exact finish, in-stock copies, then lowest price.
     */
    public function findListingForWantEntry(
        Store $store,
        ?Card $card,
        string $cardName,
        ?string $setCode,
        string $wantFinish,
        bool $wantFoil,
    ): ?InventoryItem {
        $candidates = $this->wantEntryListingQuery($store, $card, $cardName, $setCode, inStockOnly: true)
            ->setMaxResults(40)
            ->getQuery()
            ->getResult();

        $best = $this->pickBestWantListing($candidates, $wantFinish, $wantFoil);
        if ($best instanceof InventoryItem) {
            return $best;
        }

        $fallback = $this->wantEntryListingQuery($store, $card, $cardName, $setCode, inStockOnly: false)
            ->setMaxResults(40)
            ->getQuery()
            ->getResult();

        return $this->pickBestWantListing($fallback, $wantFinish, $wantFoil);
    }

    /**
     * @param list<InventoryItem> $items
     */
    private function pickBestWantListing(array $items, string $wantFinish, bool $wantFoil): ?InventoryItem
    {
        $wantFinishCanon = FinishVocabulary::canonical($wantFinish);
        $best = null;
        $bestScore = -1;
        $bestPrice = PHP_INT_MAX;

        foreach ($items as $item) {
            if (!FinishVocabulary::isFoil($item->getFinish()) === $wantFoil) {
                continue;
            }

            $score = 0;
            if ('' !== $wantFinishCanon && 0 === strcasecmp(FinishVocabulary::canonical($item->getFinish()), $wantFinishCanon)) {
                $score += 20;
            }
            if ($item->getQuantity() > 0) {
                $score += 10;
            }

            $price = $item->getPriceCents();
            if ($score > $bestScore || ($score === $bestScore && $price < $bestPrice)) {
                $best = $item;
                $bestScore = $score;
                $bestPrice = $price;
            }
        }

        return $best;
    }

    private function wantEntryListingQuery(
        Store $store,
        ?Card $card,
        string $cardName,
        ?string $setCode,
        bool $inStockOnly,
    ): QueryBuilder {
        $qb = $this->createQueryBuilder('i')
            ->join('i.card', 'c')
            ->addSelect('c')
            ->andWhere('i.store = :store')
            ->setParameter('store', $store)
            ->orderBy('i.priceCents', 'ASC')
            ->addOrderBy('i.id', 'ASC');

        if ($inStockOnly) {
            $qb->andWhere('i.quantity > 0');
        }

        if ($card instanceof Card && null !== $card->getId() && '' !== $card->getId()) {
            $qb->andWhere('c.id = :cardId')->setParameter('cardId', $card->getId());
        } else {
            $qb->andWhere('LOWER(c.name) = :cardName')->setParameter('cardName', mb_strtolower(trim($cardName)));
        }

        $set = null !== $setCode ? trim($setCode) : '';
        if ('' !== $set) {
            $qb->andWhere('LOWER(c.setCode) = :setCode')->setParameter('setCode', mb_strtolower($set));
        }

        return $qb;
    }
}
