<?php

namespace App\Service\Deck;

use App\Entity\Card;
use App\Repository\CardRepository;

/**
 * Parses pasted decklist text ("4 Lightning Bolt", "4x ...", bare names;
 * # / // comments skipped, trailing "(SET) 123" printing hints ignored,
 * duplicate names merged) and resolves each name against the catalog.
 * Unresolved names still become lines — a deck keeps the name as text and
 * links the card whenever the catalog knows it.
 */
final readonly class DecklistResolver
{
    public function __construct(private CardRepository $cards)
    {
    }

    /** @return list<array{name: string, quantity: int, card: ?Card}> */
    public function resolve(string $text, int $maxLines = 300): array
    {
        $byName = [];
        foreach (explode("\n", $text) as $rawLine) {
            $raw = trim($rawLine);
            if ('' === $raw || str_starts_with($raw, '#') || str_starts_with($raw, '//')) {
                continue;
            }
            $quantity = 1;
            if (1 === preg_match('/^(\d+)\s*[xX]?\s+(.+)$/', $raw, $matches)) {
                $quantity = max(1, (int) $matches[1]);
                $raw = $matches[2];
            }
            $name = trim((string) preg_replace('/\s*\([A-Za-z0-9]{2,6}\)\s*[\w-]*\s*$/', '', $raw));
            if ('' === $name) {
                continue;
            }
            $key = mb_strtolower($name);
            if (isset($byName[$key])) {
                $byName[$key]['quantity'] += $quantity;
            } else {
                $byName[$key] = ['name' => $name, 'quantity' => $quantity];
            }
            if (count($byName) >= $maxLines) {
                break;
            }
        }

        $lines = [];
        foreach ($byName as $line) {
            $card = $this->cards->findOneByExactName($line['name']);
            $lines[] = [
                'name' => $card?->getName() ?? $line['name'],
                'quantity' => $line['quantity'],
                'card' => $card,
            ];
        }

        return $lines;
    }
}
