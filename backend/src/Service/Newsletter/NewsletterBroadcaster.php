<?php

namespace App\Service\Newsletter;

use App\Entity\NewsletterCampaign;
use App\Entity\NewsletterSubscriber;
use App\Repository\NewsletterCampaignRepository;
use App\Repository\NewsletterSubscriberRepository;
use App\Service\Mail\TransactionalMailer;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

final class NewsletterBroadcaster
{
    public function __construct(
        private readonly NewsletterCampaignRepository $campaigns,
        private readonly NewsletterSubscriberRepository $subscribers,
        private readonly TransactionalMailer $mailer,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function sendCampaign(int $campaignId): void
    {
        $campaign = $this->campaigns->find($campaignId);
        if (!$campaign instanceof NewsletterCampaign) {
            return;
        }

        if (NewsletterCampaign::STATUS_SENDING !== $campaign->getStatus()) {
            return;
        }

        $sent = 0;
        $failed = 0;

        try {
            /** @var list<NewsletterSubscriber> $recipients */
            $recipients = $this->subscribers->findActiveSubscribers();

            foreach ($recipients as $subscriber) {
                try {
                    $this->sendToSubscriber($campaign, $subscriber);
                    ++$sent;
                } catch (\Throwable $exception) {
                    ++$failed;
                    $this->logger->warning('Newsletter send failed for {email}: {message}', [
                        'email' => $subscriber->getEmail(),
                        'message' => $exception->getMessage(),
                        'campaignId' => $campaignId,
                    ]);
                }

                if (0 === ($sent + $failed) % 25) {
                    $campaign->setSentCount($sent)->setFailedCount($failed);
                    $this->em->flush();
                }
            }

            $campaign
                ->setSentCount($sent)
                ->setFailedCount($failed)
                ->markSent()
                ->setLastError(null);
        } catch (\Throwable $exception) {
            $campaign
                ->setStatus(NewsletterCampaign::STATUS_FAILED)
                ->setSentCount($sent)
                ->setFailedCount($failed)
                ->setLastError(mb_substr($exception->getMessage(), 0, 2000));
            $this->logger->error('Newsletter campaign {id} failed: {message}', [
                'id' => $campaignId,
                'message' => $exception->getMessage(),
            ]);
        }

        $this->em->flush();
    }

    public function sendTest(NewsletterCampaign $campaign, string $to): void
    {
        $previewSubscriber = new NewsletterSubscriber(mb_strtolower(trim($to)), 'test');
        $this->sendToSubscriber($campaign, $previewSubscriber, isTest: true);
    }

    private function sendToSubscriber(
        NewsletterCampaign $campaign,
        NewsletterSubscriber $subscriber,
        bool $isTest = false,
    ): void {
        $subject = $campaign->getSubject();
        if ($isTest) {
            $subject = '[Test] '.$subject;
        }

        $unsubscribeUrl = $this->unsubscribeUrl($subscriber->getUnsubscribeToken());
        $bodyText = trim($campaign->getBody());

        $this->mailer->sendHtml(
            to: $subscriber->getEmail(),
            subject: $subject,
            htmlTemplate: 'emails/platform/newsletter_broadcast.html.twig',
            context: [
                'preheader' => $campaign->getPreheader() ?? '',
                'bodyHtml' => $this->bodyToHtml($bodyText),
                'unsubscribeUrl' => $unsubscribeUrl,
                'footerNote' => 'You are receiving this because you subscribed on LGS Card Vault.',
            ],
            textBody: $bodyText."\n\nUnsubscribe: ".$unsubscribeUrl,
            store: null,
        );
    }

    private function bodyToHtml(string $body): string
    {
        $paragraphs = preg_split('/\R\R+/', trim($body)) ?: [];
        if ([] === $paragraphs) {
            return '<p style="margin:0;font-size:15px;line-height:1.65;color:#374151;"></p>';
        }

        $html = [];
        foreach ($paragraphs as $paragraph) {
            $escaped = htmlspecialchars($paragraph, \ENT_QUOTES | \ENT_SUBSTITUTE, 'UTF-8');
            $escaped = nl2br($escaped);
            $html[] = '<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;">'.$escaped.'</p>';
        }

        return implode('', $html);
    }

    private function unsubscribeUrl(string $token): string
    {
        $base = rtrim($this->frontendUrl(), '/');

        return $base.'/newsletter/unsubscribe?token='.urlencode($token);
    }

    private function frontendUrl(): string
    {
        $url = trim((string) ($_ENV['APP_FRONTEND_URL'] ?? $_SERVER['APP_FRONTEND_URL'] ?? ''));
        if ('' === $url) {
            $url = 'https://lgscardvault.com';
        }

        return $url;
    }
}
