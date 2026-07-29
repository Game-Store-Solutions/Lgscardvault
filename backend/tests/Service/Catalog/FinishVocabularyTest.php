<?php

namespace App\Tests\Service\Catalog;

use App\Service\Catalog\FinishVocabulary;
use PHPUnit\Framework\TestCase;

/**
 * "Foil" is Magic's word. Every other game names its own treatments, and the
 * platform has to place them on the foil/nonfoil axis inventory stores.
 */
final class FinishVocabularyTest extends TestCase
{
    /** @return iterable<string, array{string, bool}> */
    public static function treatments(): iterable
    {
        // Magic (Scryfall vocabulary)
        yield 'nonfoil' => ['nonfoil', false];
        yield 'foil' => ['foil', true];
        yield 'etched' => ['etched', true];

        // Pokemon
        yield 'normal' => ['Normal', false];
        yield 'holofoil' => ['Holofoil', true];
        yield 'reverse holofoil' => ['Reverse Holofoil', true];
        yield '1st edition holofoil' => ['1st Edition Holofoil', true];
        yield '1st edition alone is a print run, not a treatment' => ['1st Edition', false];

        // Flesh and Blood
        yield 'rainbow foil' => ['Rainbow Foil', true];
        yield 'cold foil' => ['Cold Foil', true];

        // Nothing at all
        yield 'blank' => ['', false];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('treatments')]
    public function testTreatmentsLandOnTheRightSideOfTheAxis(string $name, bool $expected): void
    {
        self::assertSame($expected, FinishVocabulary::isFoil($name));
    }

    public function testAHoloOnlyPrintingAnswersToTheFoilFilter(): void
    {
        // The reported symptom: filtering a Pokemon catalog to foils returned
        // nothing, because no Pokemon card is literally called "foil".
        self::assertTrue(FinishVocabulary::offers('foil', ['Holofoil', 'Reverse Holofoil']));
        self::assertFalse(FinishVocabulary::offers('nonfoil', ['Holofoil', 'Reverse Holofoil']));
    }

    public function testAPlainOnlyPrintingIsNotOfferedAsFoil(): void
    {
        self::assertTrue(FinishVocabulary::offers('nonfoil', ['Normal']));
        self::assertFalse(FinishVocabulary::offers('foil', ['Normal']));
    }

    public function testOneSpellingPerTreatment(): void
    {
        // Otherwise "non-foil" and "nonfoil" become two inventory lines of
        // the same card, each with its own price.
        self::assertSame('Nonfoil', FinishVocabulary::canonical('non-foil'));
        self::assertSame('Nonfoil', FinishVocabulary::canonical('NONFOIL'));
        self::assertSame('Foil', FinishVocabulary::canonical(' foil '));
        self::assertSame('Etched Foil', FinishVocabulary::canonical('etched'));

        // A treatment the catalog names is kept as the catalog writes it.
        self::assertSame('Reverse Holofoil', FinishVocabulary::canonical('Reverse  Holofoil'));
        self::assertSame('', FinishVocabulary::canonical('   '));
    }

    public function testTheGenericPlaceholdersAreRecognised(): void
    {
        self::assertTrue(FinishVocabulary::isGeneric('foil'));
        self::assertTrue(FinishVocabulary::isGeneric('nonfoil'));
        self::assertTrue(FinishVocabulary::isGeneric(''));
        self::assertFalse(FinishVocabulary::isGeneric('Holofoil'), 'a real treatment is not a placeholder');
        self::assertFalse(FinishVocabulary::isGeneric('Normal'));
    }

    public function testAPrintingWithNoRecordedTreatmentsIsNeverHidden(): void
    {
        // An unpriced card has no subtypes to read; that is ignorance, not a
        // statement that it has no foil.
        self::assertTrue(FinishVocabulary::offers('foil', null));
        self::assertTrue(FinishVocabulary::offers('foil', []));
    }
}
