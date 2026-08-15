<?php

namespace App\Tests\Service\Recovery;

use App\Service\Recovery\CardReferenceResolver;
use App\Tests\Support\CatalogFixtures;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class CardReferenceResolverTest extends KernelTestCase
{
    private CardReferenceResolver $resolver;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        self::bootKernel();
        $c = self::getContainer();
        $this->resolver = $c->get(CardReferenceResolver::class);
        $this->fixtures = new CatalogFixtures($c->get('doctrine')->getManager());
    }

    public function testResolvesAFullScryfallPageUrl(): void
    {
        $this->fixtures->card(263, [
            'name' => 'Sol Ring',
            'set' => 'c21',
            'collector_number' => '263',
            'games' => ['paper'],
            'prices' => ['usd' => '1.50'],
        ]);

        $card = $this->resolver->resolve(
            'See this: https://scryfall.com/card/c21/263/sol-ring?utm_source=share thanks',
        );

        self::assertNotNull($card);
        self::assertSame('Sol Ring', $card->getName());
    }

    public function testResolvesAnEtchedPrintingPricedOnlyOnUsdEtched(): void
    {
        $this->fixtures->card(532, [
            'name' => 'Dynaheir, Invoker Adept',
            'set' => 'clb',
            'collector_number' => '532',
            'games' => ['paper'],
            'prices' => ['usd' => null, 'usd_foil' => null, 'usd_etched' => '0.31'],
        ]);

        $card = $this->resolver->resolve('https://scryfall.com/card/clb/532/dynaheir-invoker-adept');

        self::assertNotNull($card);
        self::assertSame('532', $card->getCollectorNumber());
    }

    public function testIgnoresANonScryfallUrl(): void
    {
        self::assertNull($this->resolver->resolve('http://169.254.169.254/latest/meta-data/'));
    }
}
