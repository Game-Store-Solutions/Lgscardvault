<?php

namespace App\Message;

/**
 * Midnight trigger for usage-plan platform fees. Settles each closed business
 * day's shopper capture total (10%) against the store's vaulted card.
 */
final readonly class SettlePlatformDailyFeesMessage
{
}
