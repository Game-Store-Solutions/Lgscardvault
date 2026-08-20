<?php

namespace App\Repository;

use App\Entity\Card;
use App\Entity\Game;
use App\Service\Catalog\ArtistCredits;
use App\Service\Catalog\SearchTextNormalizer;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<Card>
 */
class CardRepository extends ServiceEntityRepository
{
    /** How many same-word candidates the normalized-name fallback inspects. */
    private const NORMALIZED_MATCH_CANDIDATES = 50;

    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Card::class);
    }

    /**
     * Substring name search. Backed by the trigram GIN index on LOWER(name)
     * (see migration Version20260718090000) so the leading-% LIKE no longer
     * forces a sequential scan of the whole catalog.
     *
     * @return list<Card>
     */
    public function searchByName(string $query, int $limit = 20): array
    {
        return $this->mergeUniqueCards(
            $this->searchByNameLike($this->magicScoped(), $query, $limit),
            $this->searchMagicCatalogFolded($query, $limit),
            $limit,
        );
    }

    public function searchByNameForGame(Game $game, string $query, int $limit = 40): array
    {
        return $this->mergeUniqueCards(
            $this->searchByNameLike($this->scopedToGame($game), $query, $limit),
            $this->searchGameCatalogFolded($game, $query, $limit),
            $limit,
        );
    }

    /**
     * All catalog printings credited to an artist (exact name match on
     * artist_credits — top-level credit plus each face).
     *
     * @return list<Card>
     */
    public function findByArtistForGame(Game $game, string $artist, int $limit = 80, int $offset = 0): array
    {
        $needle = trim($artist);
        if ('' === $needle) {
            return [];
        }

        $limit = min(120, max(1, $limit));
        $offset = max(0, $offset);

        $qb = $this->scopedToGame($game);
        $this->constrainArtist($qb, $needle);

        return $qb
            ->orderBy('c.releasedAt', 'DESC')
            ->addOrderBy('c.name', 'ASC')
            ->addOrderBy('c.setCode', 'ASC')
            ->addOrderBy('c.collectorNumber', 'ASC')
            ->setFirstResult($offset)
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    public function countByArtistForGame(Game $game, string $artist): int
    {
        $needle = trim($artist);
        if ('' === $needle) {
            return 0;
        }

        $qb = $this->scopedToGame($game)->select('COUNT(c.id)');
        $this->constrainArtist($qb, $needle);

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    /**
     * Exact artist match via the artist_credits JSONB array (top-level credit
     * plus each face). Never scans scryfall_data.
     */
    private function constrainArtist(QueryBuilder $qb, string $artist): void
    {
        $param = ArtistCredits::containsParam($artist);
        if (null === $param) {
            $qb->andWhere('1 = 0');

            return;
        }

        $qb->andWhere('JSONB_CONTAINS(c.artistCredits, :artistCredit) = TRUE')
            ->setParameter('artistCredit', $param);
    }

    /**
     * @return list<Card>
     */
    private function searchByNameLike(QueryBuilder $scoped, string $query, int $limit): array
    {
        $needle = mb_strtolower(trim($query));
        if ('' === $needle) {
            return [];
        }

        return $scoped
            ->andWhere('LOWER(c.name) LIKE :query')
            ->setParameter('query', '%'.$needle.'%')
            ->orderBy('c.name', 'ASC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Legendary creatures suitable as commanders. Dedupes by oracle id so
     * multiple printings of the same commander collapse to one result.
     *
     * @return list<Card>
     */
    public function searchCommanders(string $query, int $limit = 20): array
    {
        $limit = max(1, min(40, $limit));
        $qb = $this->magicScoped()
            ->andWhere('LOWER(c.typeLine) LIKE :legendary')
            ->andWhere('LOWER(c.typeLine) LIKE :creature')
            ->setParameter('legendary', '%legendary%')
            ->setParameter('creature', '%creature%')
            ->orderBy('c.name', 'ASC')
            ->setMaxResults($limit * 3);

        $q = strtolower(trim($query));
        if ('' !== $q) {
            $qb->andWhere('LOWER(c.name) LIKE :query')
                ->setParameter('query', '%'.$q.'%');
        }

        /** @var list<Card> $rows */
        $rows = $qb->getQuery()->getResult();
        $seen = [];
        $out = [];
        foreach ($rows as $card) {
            $oracle = (string) $card->getOracleId();
            if (isset($seen[$oracle])) {
                continue;
            }
            $seen[$oracle] = true;
            $out[] = $card;
            if (count($out) >= $limit) {
                break;
            }
        }

        return $out;
    }

    public function findOneMagicById(string $id): ?Card
    {
        try {
            $uuid = \Symfony\Component\Uid\Uuid::fromString($id);
        } catch (\InvalidArgumentException) {
            return null;
        }

        $card = $this->find($uuid);
        if (!$card instanceof Card) {
            return null;
        }

        // Reject non-Magic printings even if the UUID happens to collide.
        $code = $card->resolvedGameCode();

        return Game::CODE_MTG === $code ? $card : null;
    }

    /**
     * @return list<Card>
     */
    private function searchMagicCatalogFolded(string $query, int $limit): array
    {
        $folded = SearchTextNormalizer::fold($query);
        if ('' === $folded) {
            return [];
        }

        return $this->searchByNameFoldedPhp($this->magicScoped(), $folded, $limit);
    }

    /**
     * @return list<Card>
     */
    private function searchGameCatalogFolded(Game $game, string $query, int $limit): array
    {
        $folded = SearchTextNormalizer::fold($query);
        if ('' === $folded) {
            return [];
        }

        return $this->searchByNameFoldedPhp($this->scopedToGame($game), $folded, $limit);
    }

    /**
     * First-letter candidate scan + accent-folded substring match in PHP.
     *
     * @return list<Card>
     */
    private function searchByNameFoldedPhp(QueryBuilder $scoped, string $folded, int $limit): array
    {
        $prefix = mb_substr($folded, 0, 1);
        if ('' === $prefix) {
            return [];
        }

        /** @var list<Card> $candidates */
        $candidates = $scoped
            ->andWhere('LOWER(c.name) LIKE :prefix')
            ->setParameter('prefix', $prefix.'%')
            ->orderBy('c.name', 'ASC')
            ->setMaxResults(400)
            ->getQuery()
            ->getResult();

        $matches = [];
        foreach ($candidates as $card) {
            if (str_contains(SearchTextNormalizer::fold($card->getName()), $folded)) {
                $matches[] = $card;
                if (\count($matches) >= $limit) {
                    break;
                }
            }
        }

        return $matches;
    }

    /**
     * @param list<Card> $primary
     * @param list<Card> $secondary
     *
     * @return list<Card>
     */
    private function mergeUniqueCards(array $primary, array $secondary, int $limit): array
    {
        /** @var array<string, Card> $byId */
        $byId = [];
        foreach ([...$primary, ...$secondary] as $card) {
            $byId[(string) $card->getId()] = $card;
            if (\count($byId) >= $limit) {
                break;
            }
        }

        return array_values($byId);
    }

    /**
     * Exact-name lookup for decklist lines: full name or the front face of a
     * double-faced card ("Fable of the Mirror-Breaker // ..."). Any printing
     * satisfies a deck line, so the first match wins.
     */
    public function findOneByExactName(string $name): ?\App\Entity\Card
    {
        $lower = mb_strtolower(trim($name));
        if ('' === $lower) {
            return null;
        }

        return $this->magicScoped()
            ->andWhere('LOWER(c.name) = :name OR LOWER(c.name) LIKE :front')
            ->setParameter('name', $lower)
            ->setParameter('front', $lower.' //%')
            ->orderBy('c.releasedAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Printing lookup by natural key. A printing is uniquely identified by
     * set code + collector number, and every import row carries both — this
     * is the primary (indexed, exact) match path for imports; name search is
     * only the fallback. Backed by the expression index on
     * (LOWER(set_code), LOWER(collector_number)).
     *
     * Returns a list because multiple language rows can share a set/collector
     * pair; callers pick with their own filters.
     *
     * @return list<Card>
     */
    public function findByNaturalKey(string $setCode, string $collectorNumber, int $limit = 10): array
    {
        return $this->magicScoped()
            ->andWhere('LOWER(c.setCode) = :setCode')
            ->andWhere('LOWER(c.collectorNumber) = :collectorNumber')
            ->setParameter('setCode', strtolower(trim($setCode)))
            ->setParameter('collectorNumber', strtolower(trim($collectorNumber)))
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Every Magic printing of one card, newest first.
     *
     * Backs the failed-row recovery "other printings" list: once a row matches
     * any printing, the operator can jump to the right one (Alchemy to paper,
     * wrong collector to right collector) without searching again.
     *
     * Paper-versus-digital is decided in PHP by {@see \App\Service\Catalog\PaperPrinting},
     * which reads the JSON `games` / `scryfall_data` payload, so callers filter
     * the result rather than the query doing it.
     *
     * @return list<Card>
     */
    /**
     * One representative printing per oracle identity, keyed by lowercased
     * oracle id.
     *
     * Reference decks arrive as a few hundred oracle ids at a time; fetching
     * them individually would be a textbook N+1. Oracle-level fields (text,
     * types, legalities, EDHREC rank) are identical across printings, so any
     * printing is a valid representative.
     *
     * @param list<string> $oracleIds
     *
     * @return array<string, Card>
     */
    public function mapOneCardPerOracleId(array $oracleIds): array
    {
        $uuids = [];
        foreach ($oracleIds as $oracleId) {
            $trimmed = strtolower(trim((string) $oracleId));
            if ('' === $trimmed || isset($uuids[$trimmed])) {
                continue;
            }
            try {
                $uuids[$trimmed] = Uuid::fromString($trimmed);
            } catch (\InvalidArgumentException) {
                continue;
            }
        }
        if ([] === $uuids) {
            return [];
        }

        $out = [];
        // Chunked so a large reference sample never builds an unbounded IN list.
        foreach (array_chunk(array_values($uuids), 400) as $chunk) {
            $cards = $this->createQueryBuilder('c')
                ->andWhere('c.oracleId IN (:oracles)')
                ->setParameter('oracles', $chunk)
                ->orderBy('c.releasedAt', 'ASC')
                ->addOrderBy('c.id', 'ASC')
                ->getQuery()
                ->getResult();

            foreach ($cards as $card) {
                $key = strtolower((string) $card->getOracleId());
                if (!isset($out[$key])) {
                    $out[$key] = $card;
                }
            }
        }

        return $out;
    }

    public function findPrintingsByOracleId(Uuid $oracleId, int $limit = 60): array
    {
        return $this->magicScoped()
            ->andWhere('c.oracleId = :oracleId')
            ->setParameter('oracleId', $oracleId, 'uuid')
            ->orderBy('c.releasedAt', 'DESC')
            ->addOrderBy('c.collectorNumber', 'ASC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Game-scoped printing lookup for non-Magic imports. Magic singles come
     * from Scryfall (see CatalogCardResolver); every other game's catalog is
     * local (TCGCSV), so a row resolves by matching name within the game,
     * narrowed by collector number and set when the sheet supplies them.
     */
    public function findOneForGame(Game $game, string $name, string $setCode = '', string $collectorNumber = ''): ?Card
    {
        // Magic is Scryfall's domain (CatalogCardResolver), and this
        // matcher's collector-number-first strategy is only sound where a
        // collector number is unique within the game. In Magic "254" names
        // hundreds of cards, so answering here would hand back an arbitrary
        // one — which is exactly how a repair run once re-pointed listings
        // at the wrong printings.
        if ($game->isMtg()) {
            return null;
        }

        // 1. Natural key. Outside Magic a collector number ("OP01-003",
        //    "MON038") encodes its own set and is unique within the game, so
        //    it identifies the printing on its own. Matching on it first means
        //    a sheet whose set column says "Romance Dawn" while the catalog
        //    calls it "OP-01 Romance Dawn" still resolves.
        if ('' !== trim($collectorNumber)) {
            $byNumber = $this->scopedToGame($game)
                ->andWhere('LOWER(c.collectorNumber) = :collector')
                ->setParameter('collector', mb_strtolower(trim($collectorNumber)))
                ->setMaxResults(1)
                ->getQuery()
                ->getOneOrNullResult();

            if ($byNumber instanceof Card) {
                return $byNumber;
            }
        }

        // 2. Exact name, narrowed by set when the sheet gave one.
        $exact = $this->matchByName($game, $name, $setCode, exact: true);
        if ($exact instanceof Card) {
            return $exact;
        }

        // 3. Same name ignoring punctuation and spacing. Card names in these
        //    games are punctuation-heavy ("Monkey.D.Luffy", "Trafalgar Law"),
        //    and every export writes them slightly differently.
        return $this->matchByName($game, $name, $setCode, exact: false);
    }

    /**
     * Real cards from this game's catalog, for building an import template
     * that is guaranteed to resolve. Prefers printings with a collector
     * number, since that is the natural key the importer matches on.
     *
     * @return list<Card>
     */
    public function findSampleForGame(Game $game, int $limit = 2): array
    {
        return $this->scopedToGame($game)
            ->andWhere("c.collectorNumber <> ''")
            ->orderBy('c.name', 'ASC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Cards in this game that share a name, whatever set they are in. Used to
     * turn "no match" into an error that says what the catalog does have.
     *
     * @return list<Card>
     */
    public function findNamesakesForGame(Game $game, string $name, int $limit = 5): array
    {
        // Search on the name's most distinctive word, not the whole string —
        // "Trafalgar Law (Parallel)" must still surface "Trafalgar Law".
        $seed = $this->searchSeed($name);
        if ('' === $seed) {
            return [];
        }

        return $this->scopedToGame($game)
            ->andWhere('LOWER(c.name) LIKE :like')
            ->setParameter('like', '%'.$seed.'%')
            ->orderBy('c.name', 'ASC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    private function matchByName(Game $game, string $name, string $setCode, bool $exact): ?Card
    {
        if ($exact) {
            $needle = mb_strtolower(trim($name));
            if ('' === $needle) {
                return null;
            }

            $match = $this->nameQuery($game, $needle, $setCode)->getQuery()->getOneOrNullResult();
            if ($match instanceof Card || '' === trim($setCode)) {
                return $match;
            }

            // The set narrowed it to nothing. A renamed or mistyped set column
            // should not hide a card the catalog clearly has.
            return $this->nameQuery($game, $needle, '')->getQuery()->getOneOrNullResult();
        }

        return $this->matchByNormalizedName($game, $name, $setCode);
    }

    /**
     * Fallback for names that differ only in punctuation or spacing
     * ("Monkey.D.Luffy" vs "Monkey. D. Luffy"). Those differences defeat both
     * equality and LIKE, so candidates are pulled with the name's first word
     * and compared with punctuation stripped on both sides.
     */
    private function matchByNormalizedName(Game $game, string $name, string $setCode): ?Card
    {
        $needle = $this->normalizeName($name);
        if ('' === $needle) {
            return null;
        }

        $seed = $this->searchSeed($name);
        if ('' === $seed) {
            return null;
        }

        /** @var list<Card> $candidates */
        $candidates = $this->scopedToGame($game)
            ->andWhere('LOWER(c.name) LIKE :seed')
            ->setParameter('seed', '%'.$seed.'%')
            ->setMaxResults(self::NORMALIZED_MATCH_CANDIDATES)
            ->getQuery()
            ->getResult();

        $fallback = null;
        foreach ($candidates as $candidate) {
            if ($this->normalizeName($candidate->getName()) !== $needle) {
                continue;
            }

            // A set match wins; otherwise remember the first same-name hit in
            // case the sheet's set column is wrong.
            if ('' === trim($setCode) || $this->matchesSet($candidate, $setCode)) {
                return $candidate;
            }
            $fallback ??= $candidate;
        }

        return $fallback;
    }

    private function nameQuery(Game $game, string $needle, string $setCode): QueryBuilder
    {
        $qb = $this->scopedToGame($game)
            ->andWhere('LOWER(c.name) = :name')
            ->setParameter('name', $needle)
            ->setMaxResults(1);

        if ('' !== trim($setCode)) {
            $qb->andWhere('LOWER(c.setCode) = :setCode OR LOWER(c.setName) = :setCode')
                ->setParameter('setCode', mb_strtolower(trim($setCode)));
        }

        return $qb;
    }

    private function matchesSet(Card $card, string $setCode): bool
    {
        $wanted = mb_strtolower(trim($setCode));

        return mb_strtolower($card->getSetCode()) === $wanted
            || mb_strtolower((string) $card->getSetName()) === $wanted;
    }

    /** Longest leading word of a name, used to pull normalization candidates. */
    private function searchSeed(string $name): string
    {
        preg_match_all('/[a-z0-9]+/u', mb_strtolower(trim($name)), $matches);
        $words = $matches[0] ?? [];
        if ([] === $words) {
            return '';
        }

        usort($words, static fn (string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));

        return $words[0];
    }

    /**
     * Resolve curated card names to real printings for one game, keeping the
     * caller's order. Only printings with art are returned.
     *
     * Matching is exact-first, then prefix. The prefix pass exists because the
     * catalog holds two naming conventions — Scryfall's exact names for Magic and
     * TCGCSV product names elsewhere ("Charizard (Holofoil)", "Ahri - Nine-Tailed
     * Fox") — but on its own it picks up unrelated cards that merely start with
     * the same words: "Black Lotus" matched "Black Lotus Lounge", a MagicCon
     * plane card, and won on recency. Preferring an exact hit keeps the card we
     * actually asked for.
     *
     * @param list<string> $namePrefixes
     *
     * @return list<Card>
     */
    public function findShowcaseByNamesForGame(Game $game, array $namePrefixes): array
    {
        if ([] === $namePrefixes) {
            return [];
        }

        $qb = $this->scopedToGame($game)->andWhere('c.imageUris IS NOT NULL');
        $matcher = $qb->expr()->orX();
        foreach (array_values($namePrefixes) as $index => $prefix) {
            $matcher->add(sprintf('LOWER(c.name) LIKE :showcaseName%d', $index));
            $qb->setParameter(sprintf('showcaseName%d', $index), mb_strtolower(trim($prefix)).'%');
        }

        /** @var list<Card> $rows */
        $rows = $qb->andWhere($matcher)
            ->orderBy('c.releasedAt', 'DESC')
            ->addOrderBy('c.id', 'ASC')
            // Generous cap: one curated name can match many printings, and the
            // loop below only keeps the best hit for each.
            ->setMaxResults(count($namePrefixes) * 25)
            ->getQuery()
            ->getResult();

        // Walk the curated order so the page shows what we asked for, not
        // whatever the database happened to sort first.
        $resolved = [];
        foreach ($namePrefixes as $prefix) {
            $needle = mb_strtolower(trim($prefix));

            $match = $this->firstCardMatching(
                $rows,
                $resolved,
                // Exact name, or the front face of a split/double-faced card
                // ("Fire // Ice" for a curated "Fire").
                static fn (string $name): bool => $name === $needle || str_starts_with($name, $needle.' //'),
            ) ?? $this->firstCardMatching(
                $rows,
                $resolved,
                static fn (string $name): bool => str_starts_with($name, $needle),
            );

            if (null !== $match) {
                $resolved[(string) $match->getId()] = $match;
            }
        }

        return array_values($resolved);
    }

    /**
     * First card whose lowercased name satisfies $matches and isn't already
     * taken by an earlier curated entry.
     *
     * @param list<Card>            $rows
     * @param array<string, Card>   $taken    keyed by card id
     * @param callable(string):bool $matches
     */
    private function firstCardMatching(array $rows, array $taken, callable $matches): ?Card
    {
        foreach ($rows as $card) {
            if (isset($taken[(string) $card->getId()])) {
                continue;
            }
            if ($matches(mb_strtolower($card->getName()))) {
                return $card;
            }
        }

        return null;
    }

    /**
     * Newest cards for a game that carry image data — used to top up the
     * showcase when curated names aren't in the catalog.
     *
     * @return list<Card>
     */
    public function findShowcaseCandidatesForGame(Game $game, int $limit): array
    {
        if ($limit < 1) {
            return [];
        }

        /** @var list<Card> $cards */
        $cards = $this->scopedToGame($game)
            ->andWhere('c.imageUris IS NOT NULL')
            ->orderBy('c.releasedAt', 'DESC')
            ->addOrderBy('c.id', 'ASC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();

        return $cards;
    }

    /** Base query for one game, including legacy NULL-game rows for Magic. */
    private function scopedToGame(Game $game): QueryBuilder
    {
        $qb = $this->createQueryBuilder('c');

        if ($game->isMtg()) {
            $qb->leftJoin('c.game', 'g')
                ->andWhere('g.code = :gameCode OR c.game IS NULL')
                ->setParameter('gameCode', Game::CODE_MTG);
        } else {
            $qb->andWhere('c.game = :game')->setParameter('game', $game);
        }

        return $qb;
    }

    /** Lowercase, stripped of the punctuation card names disagree about. */
    private function normalizeName(string $name): string
    {
        return str_replace(['.', ' ', '-', ','], '', SearchTextNormalizer::fold($name));
    }

    /** Is this a set code the local catalog knows? (case-insensitive) */
    public function setCodeExists(string $setCode): bool
    {
        return null !== $this->magicScoped()
            ->select('1')
            ->andWhere('LOWER(c.setCode) = :setCode')
            ->setParameter('setCode', strtolower(trim($setCode)))
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Resolve a full set NAME ("Adventures in the Forgotten Realms") to its
     * code ("afr") via the local catalog, case-insensitively. Null when no set
     * by that name is known locally.
     */
    public function findSetCodeByName(string $setName): ?string
    {
        $row = $this->magicScoped()
            ->select('c.setCode')
            ->andWhere('LOWER(c.setName) = :setName')
            ->setParameter('setName', strtolower(trim($setName)))
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();

        return is_array($row) ? (string) $row['setCode'] : null;
    }

    /**
     * Oracle ids keyed by lowercase exact / front-face name for catalog cards.
     *
     * @param list<string> $lowerNames
     * @return array<string, string> lowercase name → oracle id
     */
    public function mapOracleIdByLowerNames(array $lowerNames): array
    {
        $names = [];
        foreach ($lowerNames as $name) {
            $trimmed = mb_strtolower(trim((string) $name));
            if ('' !== $trimmed) {
                $names[$trimmed] = $trimmed;
            }
        }
        if ([] === $names) {
            return [];
        }

        $qb = $this->magicScoped();
        $or = $qb->expr()->orX('LOWER(c.name) IN (:names)');
        $i = 0;
        foreach (array_values($names) as $name) {
            $or->add('LOWER(c.name) LIKE :front'.$i);
            $qb->setParameter('front'.$i, $name.' //%');
            ++$i;
            if ($i >= 40) {
                break;
            }
        }
        $cards = $qb
            ->andWhere($or)
            ->setParameter('names', array_values($names))
            ->setMaxResults(200)
            ->getQuery()
            ->getResult();

        $map = [];
        foreach ($cards as $card) {
            if (!$card instanceof Card) {
                continue;
            }
            $oracle = strtolower((string) $card->getOracleId());
            $full = mb_strtolower($card->getName());
            $front = str_contains($full, ' // ') ? trim(explode(' // ', $full, 2)[0]) : $full;
            if (!isset($map[$full])) {
                $map[$full] = $oracle;
            }
            if (!isset($map[$front])) {
                $map[$front] = $oracle;
            }
        }

        return $map;
    }

    /**
     * Color identity keyed by lowercase exact name (front face of a DFC
     * matches the name before " // "). First printing wins.
     *
     * @param list<string> $lowerNames
     * @return array<string, list<string>>
     */
    public function mapColorIdentityByLowerNames(array $lowerNames): array
    {
        $names = [];
        foreach ($lowerNames as $name) {
            $trimmed = mb_strtolower(trim((string) $name));
            if ('' !== $trimmed) {
                $names[$trimmed] = $trimmed;
            }
        }
        if ([] === $names) {
            return [];
        }

        $qb = $this->magicScoped();
        $or = $qb->expr()->orX('LOWER(c.name) IN (:names)');
        $i = 0;
        foreach (array_values($names) as $name) {
            $or->add('LOWER(c.name) LIKE :front'.$i);
            $qb->setParameter('front'.$i, $name.' //%');
            ++$i;
            if ($i >= 40) {
                break;
            }
        }
        $cards = $qb
            ->andWhere($or)
            ->setParameter('names', array_values($names))
            ->setMaxResults(200)
            ->getQuery()
            ->getResult();

        $map = [];
        foreach ($cards as $card) {
            if (!$card instanceof Card) {
                continue;
            }
            $full = mb_strtolower($card->getName());
            $front = str_contains($full, ' // ') ? trim(explode(' // ', $full, 2)[0]) : $full;
            $identity = $card->getColorIdentity() ?? [];
            if (!isset($map[$full])) {
                $map[$full] = $identity;
            }
            if (!isset($map[$front])) {
                $map[$front] = $identity;
            }
        }

        return $map;
    }

    /**
     * Base query for the LEGACY helpers above (name search, exact name,
     * natural key, set-code lookups). Those all predate the multi-game
     * catalog and back Magic-only surfaces — deck imports, CSV resolution,
     * the buy list, Scryfall-backed search — so they must never see another
     * game's rows. Without this, a One Piece "OP13" set code or a shared
     * card name leaks into Magic flows and gets added from a Magic context.
     * Game-aware callers use the explicit *ForGame variants instead.
     */
    private function magicScoped(): QueryBuilder
    {
        return $this->createQueryBuilder('c')
            ->leftJoin('c.game', 'legacyGame')
            ->andWhere('legacyGame.code = :legacyMtg OR c.game IS NULL')
            ->setParameter('legacyMtg', Game::CODE_MTG);
    }
}
