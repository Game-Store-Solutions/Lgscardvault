<?php

namespace App\Service\Inventory;

/**
 * Query-string filters for a store inventory page. The storefront and admin
 * grids send these so the server returns one page of matches instead of the
 * whole catalog.
 */
final readonly class InventoryCatalogFilters
{
    /**
     * @param list<string> $colors Canonical identity letters (WUBRG) or ['C']
     */
    public function __construct(
        public string $q = '',
        public string $set = '',
        public string $artist = '',
        public string $type = '',
        public string $finish = 'all',
        public array $colors = [],
        public ?int $minPriceCents = null,
        public ?int $maxPriceCents = null,
        public string $sort = 'name',
    ) {
    }

    /**
     * @param array<string, mixed> $query
     */
    public static function fromQuery(array $query): self
    {
        $finish = strtolower(trim((string) ($query['finish'] ?? 'all')));
        if (!in_array($finish, ['all', 'foil', 'nonfoil'], true)) {
            $finish = 'all';
        }

        $sort = strtolower(trim((string) ($query['sort'] ?? 'name')));
        if (!in_array($sort, ['name', 'featured', 'price-asc', 'price-desc', 'newest'], true)) {
            $sort = 'name';
        }
        if ('featured' === $sort) {
            $sort = 'name';
        }

        $min = isset($query['minPriceCents']) ? (int) $query['minPriceCents'] : null;
        $max = isset($query['maxPriceCents']) ? (int) $query['maxPriceCents'] : null;

        return new self(
            q: trim((string) ($query['q'] ?? '')),
            set: trim((string) ($query['set'] ?? '')),
            artist: trim((string) ($query['artist'] ?? '')),
            type: trim((string) ($query['type'] ?? '')),
            finish: $finish,
            colors: self::parseColors((string) ($query['colors'] ?? '')),
            minPriceCents: $min > 0 ? $min : null,
            maxPriceCents: $max > 0 ? $max : null,
            sort: $sort,
        );
    }

    public function isEmpty(): bool
    {
        return '' === $this->q
            && '' === $this->set
            && '' === $this->artist
            && '' === $this->type
            && 'all' === $this->finish
            && [] === $this->colors
            && null === $this->minPriceCents
            && null === $this->maxPriceCents
            && 'name' === $this->sort;
    }

    /**
     * @return list<string>
     */
    private static function parseColors(string $raw): array
    {
        $raw = strtoupper(str_replace([',', ' ', '/'], '', trim($raw)));
        if ('' === $raw) {
            return [];
        }
        if ('C' === $raw) {
            return ['C'];
        }

        $out = [];
        foreach (str_split('WUBRG') as $letter) {
            if (str_contains($raw, $letter)) {
                $out[] = $letter;
            }
        }

        return $out;
    }
}
