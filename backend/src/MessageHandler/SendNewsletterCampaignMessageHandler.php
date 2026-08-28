<?php

namespace App\MessageHandler;

use App\Message\SendNewsletterCampaignMessage;
use App\Service\Newsletter\NewsletterBroadcaster;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
final readonly class SendNewsletterCampaignMessageHandler
{
    public function __construct(
        private NewsletterBroadcaster $broadcaster,
    ) {
    }

    public function __invoke(SendNewsletterCampaignMessage $message): void
    {
        $this->broadcaster->sendCampaign($message->campaignId);
    }
}
