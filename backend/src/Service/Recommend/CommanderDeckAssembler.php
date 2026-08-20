<?php

namespace App\Service\Recommend;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Repository\CardSynergyRepository;
use App\Repository\InventoryItemRepository;
use App\Service\CaseCards\ColorIdentityParser;
use App\Service\CaseCards\SectionSerializer;

/**
 * Builds a ~100-card Commander list from store stock.
 *
 * Slot floors (lands / ramp / draw / removal) are filled first, then Spellbook
 * combo packages with high in-stock coverage, then theme/synergy fill until
 * we hit 99 non-commander cards (100 including the commander).
 */
final class CommanderDeckAssembler
{
    private const DECK_SIZE = 100;
    private const LANDS = 36;
    private const RAMP = 10;
    private const DRAW = 10;
    private const REMOVAL = 8;

    public function __construct(
        private readonly InventoryItemRepository $inventoryItems,
        private readonly CardSynergyRepository $synergies,
        private readonly ThemeTokenizer $tokenizer,
        private readonly ColorIdentityParser $colorIdentity,
        private readonly SectionSerializer $sectionSerializer,
        private readonly StoreComboAnalyzer $comboAnalyzer,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function assemble(Store $store, Card $commander): array
    {
        $commanderTags = $this->tokenizer->tokenize($commander);
        $commanderOracle = (string) $commander->getOracleId();
        $edgeWeights = $this->synergies->weightsForOracle($commander->getOracleId());
        $identity = $commander->getColorIdentity() ?? [];

        $candidates = [];
        foreach ($this->inventoryItems->findRecommendationCandidates($store, $identity) as $item) {
            $card = $item->getCard();
            if (!$card instanceof Card) {
                continue;
            }
            if ((string) $card->getOracleId() === $commanderOracle) {
                continue;
            }
            if (!$this->colorIdentity->isSubsetOf($identity, $card->getColorIdentity())) {
                continue;
            }
            if (!$this->isCommanderLegal($card)) {
                continue;
            }

            $tags = $this->tokenizer->tokenize($card);
            $overlap = $this->tokenizer->overlap($commanderTags, $tags);
            $oracleKey = (string) $card->getOracleId();
            $edge = $edgeWeights[$oracleKey]['weight'] ?? 0.0;
            $score = (0.55 * $overlap['score']) + (0.35 * $edge) + (0.10 * min(1.0, $item->getQuantity() / 4));

            $candidates[] = [
                'item' => $item,
                'card' => $card,
                'tags' => $tags,
                'score' => $score,
                'oracle' => $oracleKey,
                'isLand' => $this->isLand($card),
            ];
        }

        usort($candidates, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        $picked = [];
        $slots = [
            'commander' => 1,
            'land' => 0,
            'ramp' => 0,
            'draw' => 0,
            'removal' => 0,
            'combo' => 0,
            'synergy' => 0,
        ];

        $targetNonCommander = self::DECK_SIZE - 1;

        $pick = function (array $row, string $slot) use (&$picked, &$slots): void {
            $oracle = $row['oracle'];
            if ('' === $oracle || isset($picked[$oracle])) {
                return;
            }
            $picked[$oracle] = [
                'slot' => $slot,
                'score' => round((float) $row['score'], 4),
                'inventoryItem' => $this->sectionSerializer->serializeInventoryItem($row['item']),
            ];
            ++$slots[$slot];
        };

        foreach ($candidates as $row) {
            if ($slots['land'] >= self::LANDS) {
                break;
            }
            if ($row['isLand']) {
                $pick($row, 'land');
            }
        }

        foreach ($candidates as $row) {
            if ($slots['ramp'] >= self::RAMP) {
                break;
            }
            if (!$row['isLand'] && $this->hasAnyTag($row['tags'], ['ramp', 'dork'])) {
                $pick($row, 'ramp');
            }
        }

        foreach ($candidates as $row) {
            if ($slots['draw'] >= self::DRAW) {
                break;
            }
            if (!$row['isLand'] && $this->hasAnyTag($row['tags'], ['draw'])) {
                $pick($row, 'draw');
            }
        }

        foreach ($candidates as $row) {
            if ($slots['removal'] >= self::REMOVAL) {
                break;
            }
            if (!$row['isLand'] && $this->hasAnyTag($row['tags'], ['removal', 'board_wipe'])) {
                $pick($row, 'removal');
            }
        }

        $comboAnalysis = $this->comboAnalyzer->analyzeForCommander($store, $commander, limit: 16);
        $comboNamesPreferred = [];
        foreach ($comboAnalysis['combos'] as $combo) {
            if (($combo['inStockCount'] ?? 0) < 2) {
                continue;
            }
            foreach ($combo['cards'] as $piece) {
                if (!empty($piece['inStock'])) {
                    $comboNamesPreferred[strtolower((string) $piece['name'])] = true;
                }
            }
        }

        foreach ($candidates as $row) {
            if (count($picked) >= $targetNonCommander) {
                break;
            }
            $nameKey = strtolower($this->frontFace($row['card']->getName()));
            if (isset($comboNamesPreferred[$nameKey]) && !$row['isLand']) {
                $pick($row, 'combo');
            }
        }

        foreach ($candidates as $row) {
            if (count($picked) >= $targetNonCommander) {
                break;
            }
            if ($row['isLand']) {
                continue;
            }
            if ($row['score'] < 0.04 && count($candidates) > 40) {
                continue;
            }
            $pick($row, 'synergy');
        }

        // Top up lands if we still have room and land stock remains.
        if (count($picked) < $targetNonCommander) {
            foreach ($candidates as $row) {
                if (count($picked) >= $targetNonCommander) {
                    break;
                }
                if ($row['isLand']) {
                    $pick($row, 'land');
                }
            }
        }

        $cards = array_values($picked);
        usort($cards, static function (array $a, array $b): int {
            $order = ['land' => 0, 'ramp' => 1, 'draw' => 2, 'removal' => 3, 'combo' => 4, 'synergy' => 5];

            return ($order[$a['slot']] ?? 9) <=> ($order[$b['slot']] ?? 9)
                ?: ($b['score'] <=> $a['score']);
        });

        $deckNames = array_map(
            static fn (array $row): string => (string) ($row['inventoryItem']['card']['name'] ?? ''),
            $cards,
        );
        $combos = $this->comboAnalyzer->analyzeForCommander($store, $commander, $deckNames, 12);

        $gaps = [];
        if ($slots['land'] < self::LANDS) {
            $gaps[] = sprintf('Need %d more lands in stock', self::LANDS - $slots['land']);
        }
        if ($slots['ramp'] < self::RAMP) {
            $gaps[] = sprintf('Need %d more ramp pieces in stock', self::RAMP - $slots['ramp']);
        }
        if ($slots['draw'] < self::DRAW) {
            $gaps[] = sprintf('Need %d more draw pieces in stock', self::DRAW - $slots['draw']);
        }
        if (count($cards) < $targetNonCommander) {
            $gaps[] = sprintf('Deck short %d cards from store stock', $targetNonCommander - count($cards));
        }

        return [
            'commander' => [
                'id' => (string) $commander->getId(),
                'oracleId' => $commanderOracle,
                'name' => $commander->getName(),
                'typeLine' => $commander->getTypeLine(),
                'manaCost' => $commander->getManaCost(),
                'cmc' => $commander->getCmc(),
                'colorIdentity' => $identity,
                'imageUrl' => $commander->getImageUrl(),
                'themes' => $commanderTags,
            ],
            'identityCode' => $this->colorIdentity->identityCode($identity),
            'targetSize' => self::DECK_SIZE,
            'filledSize' => count($cards) + 1,
            'slots' => $slots,
            'gaps' => $gaps,
            'cards' => $cards,
            'combos' => $combos['combos'],
            'inventoryIds' => array_values(array_filter(array_map(
                static fn (array $row): ?int => isset($row['inventoryItem']['id']) ? (int) $row['inventoryItem']['id'] : null,
                $cards,
            ))),
        ];
    }

    private function isLand(Card $card): bool
    {
        $type = strtolower($card->getTypeLine() ?? '');

        return str_contains($type, 'land');
    }

    /** @param list<string> $tags @param list<string> $needles */
    private function hasAnyTag(array $tags, array $needles): bool
    {
        foreach ($needles as $needle) {
            if (in_array($needle, $tags, true)) {
                return true;
            }
        }

        return false;
    }

    private function isCommanderLegal(Card $card): bool
    {
        $legalities = $card->getLegalities();
        if (!is_array($legalities) || !isset($legalities['commander'])) {
            return true;
        }

        return in_array((string) $legalities['commander'], ['legal', 'restricted'], true);
    }

    private function frontFace(string $name): string
    {
        $name = trim($name);
        if (str_contains($name, ' // ')) {
            return trim(explode(' // ', $name, 2)[0]);
        }

        return $name;
    }
}
