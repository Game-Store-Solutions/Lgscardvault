<?php

namespace App\Service\Catalog;

/**
 * Finish (treatment) names, which are each game's own vocabulary.
 *
 * Magic prints "nonfoil" and "foil". Pokemon prints "Holofoil", "Reverse
 * Holofoil", "1st Edition Holofoil". Flesh and Blood prints "Rainbow Foil"
 * and "Cold Foil". Storage is still the binary isFoil flag, so this maps any
 * game's word onto that axis, and lets a `finish=foil` filter mean "a foil
 * treatment" instead of "the literal string foil" — which is why a Pokemon
 * catalog search for foils used to come back empty.
 */
final class FinishVocabulary
{
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
