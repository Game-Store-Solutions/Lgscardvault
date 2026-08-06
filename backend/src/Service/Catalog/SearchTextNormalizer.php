<?php

namespace App\Service\Catalog;

/**
 * Fold text for fuzzy catalog/inventory search: lowercase, strip accents and
 * combining marks so "Adewale" matches "Adéwalé", "Jose" matches "José", etc.
 */
final class SearchTextNormalizer
{
    public static function fold(string $text): string
    {
        $text = mb_strtolower(trim($text));
        if ('' === $text) {
            return '';
        }

        if (\function_exists('transliterator_transliterate')) {
            $folded = transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $text);
            if (\is_string($folded) && '' !== $folded) {
                return $folded;
            }
        }

        if (\class_exists(\Normalizer::class)) {
            $decomposed = \Normalizer::normalize($text, \Normalizer::FORM_D);
            if (\is_string($decomposed)) {
                $stripped = preg_replace('/\p{M}/u', '', $decomposed);

                return \is_string($stripped) ? $stripped : $text;
            }
        }

        return $text;
    }

    /** True when folding could change the string (accents, special letters). */
    public static function foldingMayHelp(string $text): bool
    {
        return self::fold($text) !== mb_strtolower(trim($text));
    }
}
