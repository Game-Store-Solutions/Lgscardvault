<?php

namespace App\Message;

/**
 * Async broadcast of a newsletter campaign to all active subscribers.
 */
final readonly class SendNewsletterCampaignMessage
{
    public function __construct(
        public int $campaignId,
    ) {
    }
}
