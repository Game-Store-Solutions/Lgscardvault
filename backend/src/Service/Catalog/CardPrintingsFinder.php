<?php

namespace App\Service\Catalog;

use App\Entity\Card;
use App\Entity\Game;
use App\Repository\CardRepository;
use App\Service\Scryfall\ScryfallClient;

/**
 * Other paper printings of a specific catalog card — the inventory edit
 * picker. Magic uses the oracle id (and Scryfall when the local catalog is
 * thin); every other game matches the TCGPlayer base name in that game.
 */
final class CardPrintingsFinder
{
    public const LIMIT = 400;

    public function __construct(
        private readonly CardRepository $cards,
        private readonly ScryfallClient $scryfall,
    ) {
    }

    /**
     * @return list<Card>
     */
    public function find(Card $card): array
    {
        $game = $card->getGame();
        $isMtg = null === $game || $game->isMtg();

        if ($isMtg) {
            try {
                $this->scryfall->upsertPrintingsSearch(
                    'oracleid:'.$card->getOracleId()->toRfc4122(),
                    self::LIMIT,
                );
            } catch (\Throwable) {
                // Local siblings still answer when Scryfall is down.
            }

            $printings = $this->cards->findPrintingsByOracleId($card->getOracleId(), self::LIMIT);
        } elseif ($game instanceof Game) {
            $printings = $this->cards->findPrintingsByExactNameForGame(
                $game,
                (string) $card->getName(),
                self::LIMIT,
            );
        } else {
            $printings = [];
        }

        $byId = [];
        foreach ($printings as $printing) {
            if (PaperPrinting::isPaper($printing)) {
                $byId[(string) $printing->getId()] = $printing;
            }
        }

        $id = (string) $card->getId();
        if (!isset($byId[$id]) && PaperPrinting::isPaper($card)) {
            $byId = [$id => $card] + $byId;
        }

        return array_values($byId);
    }
}
