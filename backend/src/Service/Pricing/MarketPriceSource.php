<?php

namespace App\Service\Pricing;

use App\Entity\Card;

interface MarketPriceSource
{
    public function marketPriceCents(Card $card, bool $isFoil): ?int;
}
