<?php

namespace App\Service\Credit;

final class InsufficientStoreCreditException extends \RuntimeException
{
    public function __construct(public readonly int $balanceCents, public readonly int $requestedCents)
    {
        parent::__construct(sprintf('Store credit balance is %d cents; %d requested.', $balanceCents, $requestedCents));
    }
}
