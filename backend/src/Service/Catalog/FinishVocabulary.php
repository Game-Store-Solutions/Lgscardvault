<?php

namespace App\Service\Catalog;

use App\Entity\Card;

/**
 * Finish (treatment) names, which are each game's own vocabulary.
 *
 * Magic prints "nonfoil" and "foil". Pokemon prints "Holofoil", "Reverse
 * Holofoil", "1st Edition Holofoil". Flesh and Blood prints "Rainbow Foil"
 * and "Cold Foil". Inventory stores that name, so those are separate,
 * separately priced listings rather than one shared "foil" row.
 *
 * Some things stay binary — market price has a usd and a usd_foil, the card
 * shimmer is on or off — so this also places any game's word on that axis,
 * which is what lets a `finish=foil` filter mean "a foil treatment" instead
 * of "the literal string foil".
 */
final class FinishVocabulary
{
    /** Longest treatment name the schema stores. */
    public const MAX_LENGTH = 40;

    /** What a printing is called when nothing better is known. */
    public const DEFAULT_PLAIN = 'Nonfoil';
    public const DEFAULT_FOIL = 'Foil';

    /**
     * Each game's plain and foil printing, used when a card's own treatments
     * were never recorded (an unpriced or not-yet-synced printing).
     *
     * @var array<string, array{string, string}>
     */
    private const GAME_DEFAULTS = [
        'mtg' => [self::DEFAULT_PLAIN, self::DEFAULT_FOIL],
        'pokemon' => ['Normal', 'Holofoil'],
        'onepiece' => ['Normal', 'Foil'],
        'fab' => ['Normal', 'Rainbow Foil'],
        'riftbound' => ['Normal', 'Foil'],
    ];

    /**
     * Spellings that mean the same treatment. Everything else is stored as
     * the catalog writes it — "Reverse Holofoil" needs no translation.
     *
     * @var array<string, string>
     */
    private const ALIASES = [
        'nonfoil' => self::DEFAULT_PLAIN,
        'non-foil' => self::DEFAULT_PLAIN,
        'non foil' => self::DEFAULT_PLAIN,
        'foil' => self::DEFAULT_FOIL,
        'etched' => 'Etched Foil',
        'etched foil' => 'Etched Foil',
        'regular' => 'Normal',
    ];

    /** Substrings that mark a foil treatment somewhere in the catalog. */
    private const FOIL_MARKERS = [
        'foil', 'holo', 'prism', 'rainbow', 'etched', 'shatter', 'galaxy', 'gilded',
    ];

    /** Names that read as foil-ish but are the plain printing. */
    private const PLAIN_NAMES = ['normal', 'unlimited', 'unlimited edition', '1st edition'];

    public static function isFoil(string $name): bool
    {
        $normalized = strtolower(trim($name));
        if ('' === $normalized) {
            return false;
        }

        // "nonfoil" / "non-foil" contain "foil" but mean the opposite.
        if (str_starts_with($normalized, 'non')) {
            return false;
        }
        if (in_array($normalized, self::PLAIN_NAMES, true)) {
            return false;
        }

        foreach (self::FOIL_MARKERS as $marker) {
            if (str_contains($normalized, $marker)) {
                return true;
            }
        }

        return false;
    }

    /**
     * One spelling per treatment, so "non-foil" and "nonfoil" cannot become
     * two separate inventory lines of the same card.
     */
    public static function canonical(string $name): string
    {
        $collapsed = trim((string) preg_replace('/\s+/u', ' ', $name));
        if ('' === $collapsed) {
            return '';
        }

        return mb_substr(self::ALIASES[mb_strtolower($collapsed)] ?? $collapsed, 0, self::MAX_LENGTH);
    }

    /**
     * Is this only the platform's placeholder for "plain" / "foil", rather
     * than a treatment a catalog actually named? Generic values get replaced
     * by the printing's own word for that side of the axis.
     */
    public static function isGeneric(string $name): bool
    {
        $canonical = self::canonical($name);

        return '' === $canonical
            || self::DEFAULT_PLAIN === $canonical
            || self::DEFAULT_FOIL === $canonical;
    }

    /** What this game calls its plain / foil printing. */
    public static function defaultFor(?string $gameCode, bool $foil): string
    {
        $defaults = self::GAME_DEFAULTS[$gameCode ?? ''] ?? self::GAME_DEFAULTS['mtg'];

        return $foil ? $defaults[1] : $defaults[0];
    }

    /**
     * The treatment to store for a listing of this card.
     *
     * A caller that names one ("Reverse Holofoil") gets it, matched against
     * the printing's own treatments so casing stays consistent. A caller with
     * only the old foil/not-foil boolean gets the card's own word for that
     * side — "Holofoil" on a Pokemon card, "Foil" on a Magic one.
     */
    public static function resolveForCard(Card $card, ?string $requested, ?bool $foilHint = null): string
    {
        $published = $card->getFinishes() ?? [];
        $canonical = self::canonical((string) $requested);

        if ('' !== $canonical) {
            foreach ($published as $finish) {
                if (0 === strcasecmp(self::canonical($finish), $canonical)) {
                    return self::canonical($finish);
                }
            }

            // Catalogs lag reality; a treatment we have not synced yet is
            // still a treatment the store can hold in a box.
            return $canonical;
        }

        $foil = $foilHint ?? false;
        foreach ($published as $finish) {
            if (self::isFoil($finish) === $foil) {
                return self::canonical($finish);
            }
        }

        return self::defaultFor($card->resolvedGameCode(), $foil);
    }

    /**
     * Is this printing published on the side of the foil/nonfoil axis the
     * filter asks for? A card whose treatments we never recorded is not
     * hidden — an unpriced Pokemon card should still be findable.
     *
     * @param list<string>|null $finishes
     */
    public static function offers(string $filter, ?array $finishes): bool
    {
        if (null === $finishes || [] === $finishes) {
            return true;
        }

        $wantFoil = self::isFoil($filter);
        foreach ($finishes as $finish) {
            if (self::isFoil($finish) === $wantFoil) {
                return true;
            }
        }

        return false;
    }
}
