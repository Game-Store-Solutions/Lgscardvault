<?php

namespace App\Service\Catalog;

use App\Entity\Card;

/**
 * Detects Magic printings that only exist digitally (Alchemy, Arena-only,
 * MTGO-only, etc.). Physical stores stock paper cards — these must never
 * land in inventory.
 */
final class PaperPrinting
{
    /**
     * Why this printing is online-only, or null when it is (or appears to be)
     * a paper card. Missing games metadata is treated as paper so older
     * catalog rows without Scryfall enrichment are not falsely rejected.
     */
    public static function onlineOnlyReason(Card $card): ?string
    {
        $game = $card->getGame();
        if (null !== $game && !$game->isMtg()) {
            return null;
        }

        $data = $card->getScryfallData() ?? [];
        if (true === ($data['digital'] ?? false)) {
            return 'Online-only (digital) printing. Paper cards only.';
        }

        $setType = $data['set_type'] ?? null;
        if (is_string($setType) && 'alchemy' === strtolower($setType)) {
            return 'Alchemy set printing. Paper cards only.';
        }

        $games = $card->getGames();
        if (!is_array($games) || [] === $games) {
            $games = is_array($data['games'] ?? null) ? $data['games'] : null;
        }
        if (is_array($games) && [] !== $games && !in_array('paper', $games, true)) {
            return 'Online-only printing (Arena/MTGO). Paper cards only.';
        }

        $collector = trim($card->getCollectorNumber());
        if (1 === preg_match('/^A[-.]/i', $collector)) {
            return 'Alchemy / digital collector number. Paper cards only.';
        }

        $name = trim($card->getName());
        if (str_starts_with($name, 'A-')) {
            return 'Alchemy (Arena) printing. Paper cards only.';
        }

        return null;
    }

    public static function isPaper(Card $card): bool
    {
        return null === self::onlineOnlyReason($card);
    }
}
