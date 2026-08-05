<?php

namespace App\Service\Checkout;

/** A cart line can no longer be fulfilled from current stock. */
final class OutOfStockException extends \RuntimeException
{
}
