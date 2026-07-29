<?php

namespace App\Service\CsvImport;

use App\Entity\CsvImportJob;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Repository\SealedProductRepository;

/**
 * Builds the downloadable sample CSV for a game.
 *
 * The rows are REAL entries from that game's synced catalog, not invented
 * ones. A template full of plausible-looking examples is worse than
 * useless: a store downloads it, imports it unchanged, and every row fails
 * because those exact printings were never synced — which reads as a broken
 * importer. Sampling the catalog means the sample always resolves.
 *
 * The curated examples below are the fallback for a game with nothing
 * synced yet, where no template could import successfully anyway; they at
 * least show the shape and each game's own conventions.
 */
final readonly class ImportTemplateBuilder
{
    /** Header row for a singles sheet — the parser's required columns. */
    private const CARD_HEADERS = [
        'name', 'game', 'set', 'condition', 'foil', 'rarity', 'quantity', 'variant', 'collectorNumber',
    ];

    /** Header row for a sealed sheet. */
    private const SEALED_HEADERS = ['name', 'set', 'quantity', 'price', 'productId'];

    /**
     * Two example singles per game, in that game's own naming conventions.
     *
     * @var array<string, list<array{string, string, string, string, string}>> code => [name, set, rarity, collector, foil]
     */
    private const CARD_EXAMPLES = [
        'mtg' => [
            ['Lightning Bolt', 'mh2', 'uncommon', '401', 'No'],
            ['Ragavan, Nimble Pilferer', 'mh2', 'mythic', '138', 'Yes'],
        ],
        'pokemon' => [
            ['Charizard ex', 'Obsidian Flames', 'Double Rare', '125', 'No'],
            ['Pikachu', 'Scarlet & Violet 151', 'Illustration Rare', '173', 'Yes'],
        ],
        'onepiece' => [
            ['Monkey.D.Luffy', 'Romance Dawn', 'Leader', 'OP01-003', 'No'],
            ['Trafalgar Law', 'Romance Dawn', 'Super Rare', 'OP01-047', 'Yes'],
        ],
        'fab' => [
            ['Command and Conquer', 'Monarch', 'Majestic', 'MON038', 'No'],
            ['Enlightened Strike', 'Welcome to Rathe', 'Legendary', 'WTR159', 'Yes'],
        ],
        'riftbound' => [
            ['Jinx', 'Origins', 'Epic', 'OGN-042', 'No'],
            ['Yasuo', 'Origins', 'Rare', 'OGN-118', 'Yes'],
        ],
    ];

    /**
     * @var array<string, list<array{string, string, string}>> code => [name, set, price]
     */
    private const SEALED_EXAMPLES = [
        'mtg' => [
            ['Modern Horizons 3 Play Booster Box', 'Modern Horizons 3', '249.99'],
            ['Bloomburrow Bundle', 'Bloomburrow', '39.99'],
        ],
        'pokemon' => [
            ['Obsidian Flames Booster Box', 'Obsidian Flames', '129.99'],
            ['Scarlet & Violet 151 Elite Trainer Box', 'Scarlet & Violet 151', '59.99'],
        ],
        'onepiece' => [
            ['Romance Dawn Booster Box', 'Romance Dawn', '94.99'],
            ['Starter Deck Straw Hat Crew', 'Starter Decks', '12.99'],
        ],
        'fab' => [
            ['Rosetta Booster Box', 'Rosetta', '109.99'],
            ['Monarch Blitz Deck', 'Monarch', '14.99'],
        ],
        'riftbound' => [
            ['Origins Booster Box', 'Origins', '99.99'],
            ['Origins Starter Deck', 'Origins', '19.99'],
        ],
    ];

    /** Fallback for a game added later that has no hand-written examples yet. */
    private const GENERIC_CARD_EXAMPLE = [
        ['Example Card Name', 'SET1', 'rare', '001', 'No'],
        ['Another Card Name', 'SET1', 'common', '002', 'Yes'],
    ];

    private const GENERIC_SEALED_EXAMPLE = [
        ['Example Booster Box', 'Set Name', '99.99'],
        ['Example Starter Deck', 'Set Name', '14.99'],
    ];

    public function __construct(
        private CardRepository $cards,
        private SealedProductRepository $sealedProducts,
    ) {
    }

    public function build(Game $game, string $importType): string
    {
        return CsvImportJob::TYPE_SEALED === $importType
            ? $this->buildSealed($game)
            : $this->buildCards($game);
    }

    public function filename(Game $game, string $importType): string
    {
        return sprintf(
            '%s-%s-inventory-template.csv',
            $game->getCode(),
            CsvImportJob::TYPE_SEALED === $importType ? 'sealed' : 'singles',
        );
    }

    private function buildCards(Game $game): string
    {
        $rows = [self::CARD_HEADERS];

        // Real catalog entries first — these import cleanly by construction.
        foreach ($this->cards->findSampleForGame($game) as $card) {
            $rows[] = [
                $card->getName(),
                $game->getName(),
                $card->getSetCode(),
                'NM',
                'No',
                (string) ($card->getRarity() ?? ''),
                '1',
                '',
                $card->getCollectorNumber(),
            ];
        }

        if (count($rows) > 1) {
            return $this->toCsv($rows);
        }

        foreach (self::CARD_EXAMPLES[$game->getCode()] ?? self::GENERIC_CARD_EXAMPLE as [$name, $set, $rarity, $collector, $foil]) {
            // Column order must match CARD_HEADERS exactly.
            $rows[] = [$name, $game->getName(), $set, 'NM', $foil, $rarity, '1', '', $collector];
        }

        return $this->toCsv($rows);
    }

    private function buildSealed(Game $game): string
    {
        $rows = [self::SEALED_HEADERS];

        foreach ($this->sealedProducts->findSampleForGame($game) as $product) {
            $rows[] = [
                $product->getName(),
                (string) ($product->getGameSet()?->getName() ?? ''),
                '1',
                null !== $product->getMarketPriceCents()
                    ? number_format($product->getMarketPriceCents() / 100, 2, '.', '')
                    : '',
                // The TCGplayer id makes the row match exactly, whatever the
                // name looks like.
                (string) $product->getTcgcsvProductId(),
            ];
        }

        if (count($rows) > 1) {
            return $this->toCsv($rows);
        }

        foreach (self::SEALED_EXAMPLES[$game->getCode()] ?? self::GENERIC_SEALED_EXAMPLE as [$name, $set, $price]) {
            // productId is optional; blank means "match on name".
            $rows[] = [$name, $set, '1', $price, ''];
        }

        return $this->toCsv($rows);
    }

    /** @param list<list<string>> $rows */
    private function toCsv(array $rows): string
    {
        $stream = fopen('php://temp', 'r+');
        if (false === $stream) {
            throw new \RuntimeException('Could not open a temporary stream to build the template.');
        }

        try {
            foreach ($rows as $row) {
                fputcsv($stream, $row, ',', '"', '\\');
            }
            rewind($stream);

            return (string) stream_get_contents($stream);
        } finally {
            fclose($stream);
        }
    }
}
