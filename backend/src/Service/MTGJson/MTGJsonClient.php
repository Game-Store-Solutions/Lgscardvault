<?php

namespace App\Service\MTGJson;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * MTGJSON is our normalized card-metadata source and the source of Wizards'
 * preconstructed decklists.
 *
 * It is explicitly *not* a source of community deck popularity: `DeckList.json`
 * contains only published products (about 190 of ~3,000 entries are Commander
 * precons) with no view counts, rankings, or archetype tags. Community
 * reference decks come from DeckDataProviderInterface implementations instead.
 */
class MTGJsonClient
{
    private const SET_URL = 'https://mtgjson.com/api/v5/';
    private const DECK_LIST_URL = 'https://mtgjson.com/api/v5/DeckList.json';
    private const DECK_URL = 'https://mtgjson.com/api/v5/decks/';
    public const DECK_TYPE_COMMANDER = 'Commander Deck';
    private const MAX_CACHED_SETS = 4;
    private const MAX_SET_RESPONSE_BYTES = 8 * 1024 * 1024;

    /** @var list<string> */
    private const SKIP_SET_CODES = [
        // The List is very large and can exceed PHP's 128 MB memory limit when
        // decoded as one MTGJSON set payload. Scryfall search handles it safely.
        'PLST',
    ];

    /** @var array<string, list<array{name: string, number: string, rarity: string, finishes: list<string>, identifiers: array<string, mixed>}>> */
    private array $setCache = [];

    public function __construct(private readonly HttpClientInterface $httpClient)
    {
    }

    /** @return list<array{name: string, number: string, rarity: string, finishes: list<string>, identifiers: array<string, mixed>}> */
    public function getSetCards(string $setCode): array
    {
        $normalizedSet = strtoupper(trim($setCode));
        if ('' === $normalizedSet) {
            return [];
        }

        if (in_array($normalizedSet, self::SKIP_SET_CODES, true)) {
            $this->setCache[$normalizedSet] = [];

            return [];
        }

        if (isset($this->setCache[$normalizedSet])) {
            return $this->setCache[$normalizedSet];
        }

        $response = $this->httpClient->request('GET', self::SET_URL.$normalizedSet.'.json', [
            'headers' => ['User-Agent' => 'MTGStore/1.0'],
        ]);

        if (200 !== $response->getStatusCode()) {
            $this->setCache[$normalizedSet] = [];

            return [];
        }

        $contentLength = (int) ($response->getHeaders(false)['content-length'][0] ?? 0);
        if ($contentLength > self::MAX_SET_RESPONSE_BYTES) {
            $this->setCache[$normalizedSet] = [];

            return [];
        }

        $payload = $response->toArray(false);
        $cards = $payload['data']['cards'] ?? [];
        if (!is_array($cards)) {
            $cards = [];
        }

        $this->setCache[$normalizedSet] = array_values(array_filter(array_map(
            static function (mixed $card): ?array {
                if (!is_array($card)) {
                    return null;
                }

                $finishes = $card['finishes'] ?? [];
                $identifiers = $card['identifiers'] ?? [];

                return [
                    'name' => (string) ($card['name'] ?? ''),
                    'number' => (string) ($card['number'] ?? ''),
                    'rarity' => (string) ($card['rarity'] ?? ''),
                    'finishes' => is_array($finishes) ? array_values($finishes) : [],
                    'identifiers' => is_array($identifiers) ? $identifiers : [],
                ];
            },
            $cards,
        )));
        if (count($this->setCache) > self::MAX_CACHED_SETS) {
            unset($this->setCache[(string) array_key_first($this->setCache)]);
        }
        unset($payload, $cards);

        return $this->setCache[$normalizedSet];
    }

    /**
     * Published deck products, optionally narrowed to one deck type.
     *
     * @return list<array{code: string, fileName: string, name: string, releaseDate: string, type: string}>
     */
    public function getDeckList(?string $type = null): array
    {
        $payload = $this->fetchJson(self::DECK_LIST_URL);
        $decks = $payload['data'] ?? null;
        if (!is_array($decks)) {
            return [];
        }

        $out = [];
        foreach ($decks as $deck) {
            if (!is_array($deck)) {
                continue;
            }
            $deckType = (string) ($deck['type'] ?? '');
            if (null !== $type && $deckType !== $type) {
                continue;
            }
            $fileName = (string) ($deck['fileName'] ?? '');
            if ('' === $fileName) {
                continue;
            }
            $out[] = [
                'code' => (string) ($deck['code'] ?? ''),
                'fileName' => $fileName,
                'name' => (string) ($deck['name'] ?? $fileName),
                'releaseDate' => (string) ($deck['releaseDate'] ?? ''),
                'type' => $deckType,
            ];
        }

        return $out;
    }

    /**
     * One deck product. `commander` and `mainBoard` rows carry
     * `identifiers.scryfallOracleId`, so decks join to our catalog on oracle id
     * without any name matching.
     *
     * @return ?array{name: string, type: string, code: string, releaseDate: string, commander: list<array<string, mixed>>, mainBoard: list<array<string, mixed>>}
     */
    public function getDeck(string $fileName): ?array
    {
        $name = trim($fileName);
        if ('' === $name) {
            return null;
        }

        $payload = $this->fetchJson(self::DECK_URL.$name.'.json');
        $data = $payload['data'] ?? null;
        if (!is_array($data)) {
            return null;
        }

        return [
            'name' => (string) ($data['name'] ?? $name),
            'type' => (string) ($data['type'] ?? ''),
            'code' => (string) ($data['code'] ?? ''),
            'releaseDate' => (string) ($data['releaseDate'] ?? ''),
            'commander' => array_values(array_filter((array) ($data['commander'] ?? []), 'is_array')),
            'mainBoard' => array_values(array_filter((array) ($data['mainBoard'] ?? []), 'is_array')),
        ];
    }

    /** @return array<string, mixed> */
    private function fetchJson(string $url): array
    {
        try {
            $response = $this->httpClient->request('GET', $url, [
                'headers' => ['User-Agent' => 'MTGStore/1.0', 'Accept' => 'application/json'],
                'timeout' => 30,
            ]);
            if (200 !== $response->getStatusCode()) {
                return [];
            }

            $payload = $response->toArray(false);

            return is_array($payload) ? $payload : [];
        } catch (\Throwable) {
            return [];
        }
    }
}
