<?php

namespace App\Service\Catalog;

/**
 * TCGPlayer product names bake set/treatment into the title
 * ("Shanks (OP04) (Manga)", "Shanks - OP09-004 (Gold)"). Magic uses oracle
 * identity instead; every other game groups printings by this stripped name.
 */
final class CardNameIdentity
{
    public static function baseName(string $name): string
    {
        $trimmed = trim($name);
        if ('' === $trimmed) {
            return '';
        }

        $base = $trimmed;
        $previous = null;
        while ($previous !== $base) {
            $previous = $base;
            $base = trim((string) preg_replace('/\s*[\(\[][^\)\]]+[\)\]]\s*$/u', '', $base));
        }

        $base = trim((string) preg_replace('/\s+-\s+[A-Za-z]{1,8}\d{0,4}(?:-[A-Za-z0-9]+)?\s*$/u', '', $base));

        return '' !== $base ? $base : $trimmed;
    }

    public static function matches(string $left, string $right): bool
    {
        return self::fold(self::baseName($left)) === self::fold(self::baseName($right));
    }

    public static function fold(string $name): string
    {
        return trim(preg_replace('/\s+/u', ' ', SearchTextNormalizer::fold($name)) ?? SearchTextNormalizer::fold($name));
    }
}
