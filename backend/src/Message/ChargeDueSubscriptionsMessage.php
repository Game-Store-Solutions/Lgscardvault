<?php

namespace App\Message;

/**
 * Nightly trigger for platform subscription renewals. Carries no payload — the
 * handler selects whichever stores have come due at the moment it runs.
 */
final readonly class ChargeDueSubscriptionsMessage
{
}
