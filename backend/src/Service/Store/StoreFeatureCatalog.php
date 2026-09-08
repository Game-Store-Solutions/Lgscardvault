<?php

namespace App\Service\Store;

/**
 * Canonical storefront feature flags. Missing keys default to on so existing
 * stores keep every surface until an owner turns one off.
 */
final class StoreFeatureCatalog
{
    public const EVENTS = 'events';
    public const SELL_TRADE = 'sellTrade';
    public const SEALED = 'sealed';
    public const CASE_CARDS = 'caseCards';
    public const MASS_SEARCH = 'massSearch';
    public const DECK_BUILDER = 'deckBuilder';
    public const SPOTLIGHT = 'spotlight';
    public const STORE_CREDIT = 'storeCredit';

    /** @var list<string> */
    public const KEYS = [
        self::EVENTS,
        self::SELL_TRADE,
        self::SEALED,
        self::CASE_CARDS,
        self::MASS_SEARCH,
        self::DECK_BUILDER,
        self::SPOTLIGHT,
        self::STORE_CREDIT,
    ];

    /** @return array<string, bool> */
    public static function defaults(): array
    {
        $out = [];
        foreach (self::KEYS as $key) {
            $out[$key] = true;
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $stored
     *
     * @return array<string, bool>
     */
    public static function resolve(array $stored): array
    {
        $out = self::defaults();
        foreach ($stored as $key => $value) {
            if (!is_string($key) || !array_key_exists($key, $out)) {
                continue;
            }
            if (is_bool($value)) {
                $out[$key] = $value;
            }
        }

        return $out;
    }

    /**
     * Partial patch: only the keys present in the payload. Unknown keys or
     * non-boolean values fail validation.
     *
     * @return array<string, bool>
     */
    public static function patchFromPayload(mixed $raw): array
    {
        if (!is_array($raw)) {
            throw new \InvalidArgumentException('features must be an object of on/off flags.');
        }

        $patch = [];
        foreach ($raw as $key => $value) {
            if (!is_string($key) || !in_array($key, self::KEYS, true)) {
                throw new \InvalidArgumentException(sprintf('Unknown store feature "%s".', is_string($key) ? $key : get_debug_type($key)));
            }
            if (!is_bool($value)) {
                throw new \InvalidArgumentException(sprintf('features.%s must be true or false.', $key));
            }
            $patch[$key] = $value;
        }

        return $patch;
    }
}
