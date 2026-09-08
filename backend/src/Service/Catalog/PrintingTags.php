<?php

namespace App\Service\Catalog;

use App\Entity\Card;

/**
 * Visual / identity tags for a pick sheet description: Showcase, Inverted,
 * Booster Fun, Legendary, and the like. Pulled from Scryfall frame effects,
 * a short promo-type allowlist, and the type line — not the full promo dump,
 * which would bury the picker in set-promo noise.
 */
final class PrintingTags
{
    /** Promo types that actually help staff tell printings apart at a glance. */
    private const PROMO_LABELS = [
        'boosterfun' => 'Booster Fun',
        'serialized' => 'Serialized',
        'prerelease' => 'Prerelease',
        'datestamped' => 'Date Stamped',
        'stepandcompleat' => 'Step-and-Compleat',
        'surgefoil' => 'Surge Foil',
        'galaxyfoil' => 'Galaxy Foil',
        'neonink' => 'Neon Ink',
    ];

    private const FRAME_LABELS = [
        'showcase' => 'Showcase',
        'inverted' => 'Inverted',
        'extendedart' => 'Extended Art',
        'fullart' => 'Full Art',
        'borderless' => 'Borderless',
        'etched' => 'Etched',
        'snow' => 'Snow',
        'companion' => 'Companion',
        'lesson' => 'Lesson',
        'shatteredglass' => 'Shattered Glass',
    ];

    /**
     * @return list<string>
     */
    public static function fromCard(?Card $card): array
    {
        if (null === $card) {
            return [];
        }

        return self::collect($card->getTypeLine(), $card->getScryfallData());
    }

    /**
     * @param array<string, mixed>|null $scryfallData
     *
     * @return list<string>
     */
    public static function collect(?string $typeLine, ?array $scryfallData): array
    {
        $seen = [];
        $data = $scryfallData ?? [];

        foreach (self::stringList($data['frame_effects'] ?? null) as $effect) {
            $key = self::normalize($effect);
            if ('legendary' === $key) {
                continue;
            }
            self::push($seen, self::FRAME_LABELS[$key] ?? self::humanize($effect));
        }

        foreach (self::stringList($data['promo_types'] ?? null) as $promo) {
            $key = self::normalize($promo);
            if (isset(self::PROMO_LABELS[$key])) {
                self::push($seen, self::PROMO_LABELS[$key]);
            }
        }

        if (!empty($data['full_art'])) {
            self::push($seen, 'Full Art');
        }
        if (!empty($data['textless'])) {
            self::push($seen, 'Textless');
        }
        if ('borderless' === strtolower((string) ($data['border_color'] ?? ''))) {
            self::push($seen, 'Borderless');
        }

        if (is_string($typeLine) && 1 === preg_match('/\bLegendary\b/i', $typeLine)) {
            self::push($seen, 'Legendary');
        }

        return array_keys($seen);
    }

    /** @param array<string, true> $seen */
    private static function push(array &$seen, string $label): void
    {
        $trimmed = trim($label);
        if ('' === $trimmed) {
            return;
        }
        $seen[$trimmed] = true;
    }

    private static function normalize(string $value): string
    {
        return strtolower(str_replace(['_', '-', ' '], '', $value));
    }

    private static function humanize(string $tag): string
    {
        return ucwords(strtolower(str_replace(['_', '-'], ' ', $tag)));
    }

    /** @return list<string> */
    private static function stringList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $item) {
            if (is_string($item) && '' !== trim($item)) {
                $out[] = trim($item);
            }
        }

        return $out;
    }
}
