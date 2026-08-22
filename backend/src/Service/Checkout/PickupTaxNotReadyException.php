<?php

namespace App\Service\Checkout;

/** Card checkout blocked because Square location tax is $0 in a sales-tax state. */
final class PickupTaxNotReadyException extends \RuntimeException
{
}
