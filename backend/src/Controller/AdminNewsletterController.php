<?php

namespace App\Controller;

use App\Entity\NewsletterCampaign;
use App\Entity\NewsletterSubscriber;
use App\Message\SendNewsletterCampaignMessage;
use App\Repository\NewsletterCampaignRepository;
use App\Repository\NewsletterSubscriberRepository;
use App\Service\Newsletter\NewsletterBroadcaster;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/newsletter')]
#[IsGranted('ROLE_SUPER_ADMIN')]
final class AdminNewsletterController extends AbstractController
{
    private const MAX_SUBJECT = 160;
    private const MAX_PREHEADER = 200;
    private const MAX_BODY = 50000;

    public function __construct(
        private readonly NewsletterSubscriberRepository $subscribers,
        private readonly NewsletterCampaignRepository $campaigns,
        private readonly NewsletterBroadcaster $broadcaster,
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
    }

    #[Route('/subscribers/stats', name: 'api_admin_newsletter_subscriber_stats', methods: ['GET'])]
    public function subscriberStats(): JsonResponse
    {
        return $this->json($this->subscribers->stats());
    }

    #[Route('/subscribers', name: 'api_admin_newsletter_subscribers', methods: ['GET'])]
    public function listSubscribers(Request $request): JsonResponse
    {
        $page = max(1, (int) $request->query->get('page', 1));
        $limit = min(100, max(1, (int) $request->query->get('limit', 50)));
        $q = $request->query->get('q');

        $result = $this->subscribers->searchPaginated(is_string($q) ? $q : null, $page, $limit);

        return $this->json([
            'items' => array_map(static fn (NewsletterSubscriber $row) => $row->toArray(), $result['items']),
            'total' => $result['total'],
            'page' => $page,
            'limit' => $limit,
        ]);
    }

    #[Route('/subscribers/{id}', name: 'api_admin_newsletter_subscriber_delete', methods: ['DELETE'])]
    public function deleteSubscriber(int $id): JsonResponse
    {
        $subscriber = $this->subscribers->find($id);
        if (!$subscriber instanceof NewsletterSubscriber) {
            return $this->json(['detail' => 'Subscriber not found.'], 404);
        }

        $this->em->remove($subscriber);
        $this->em->flush();

        return $this->json(null, 204);
    }

    #[Route('/campaigns', name: 'api_admin_newsletter_campaigns_list', methods: ['GET'])]
    public function listCampaigns(): JsonResponse
    {
        return $this->json(array_map(
            static fn (NewsletterCampaign $campaign) => $campaign->toArray(),
            $this->campaigns->findAllNewestFirst(),
        ));
    }

    #[Route('/campaigns/{id}', name: 'api_admin_newsletter_campaign_show', methods: ['GET'])]
    public function showCampaign(int $id): JsonResponse
    {
        $campaign = $this->campaigns->find($id);
        if (!$campaign instanceof NewsletterCampaign) {
            return $this->json(['detail' => 'Campaign not found.'], 404);
        }

        return $this->json($campaign->toArray());
    }

    #[Route('/campaigns', name: 'api_admin_newsletter_campaigns_create', methods: ['POST'])]
    public function createCampaign(Request $request): JsonResponse
    {
        $payload = $request->toArray();
        if (null !== $error = $this->validateCampaignPayload($payload)) {
            return $this->json(['detail' => $error], 422);
        }

        $campaign = (new NewsletterCampaign())
            ->setSubject(mb_substr(trim((string) $payload['subject']), 0, self::MAX_SUBJECT))
            ->setPreheader($this->optionalPreheader($payload['preheader'] ?? null))
            ->setBody(trim((string) $payload['body']));

        $this->em->persist($campaign);
        $this->em->flush();

        return $this->json($campaign->toArray(), 201);
    }

    #[Route('/campaigns/{id}', name: 'api_admin_newsletter_campaigns_update', methods: ['PATCH'])]
    public function updateCampaign(Request $request, int $id): JsonResponse
    {
        $campaign = $this->campaigns->find($id);
        if (!$campaign instanceof NewsletterCampaign) {
            return $this->json(['detail' => 'Campaign not found.'], 404);
        }

        if (!$campaign->isEditable()) {
            return $this->json(['detail' => 'This campaign can no longer be edited.'], 409);
        }

        $payload = $request->toArray();
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        if (array_key_exists('subject', $payload)) {
            $subject = trim((string) $payload['subject']);
            if ('' === $subject) {
                return $this->json(['detail' => 'Subject cannot be empty.'], 422);
            }
            $campaign->setSubject(mb_substr($subject, 0, self::MAX_SUBJECT));
        }
        if (array_key_exists('preheader', $payload)) {
            $campaign->setPreheader($this->optionalPreheader($payload['preheader']));
        }
        if (array_key_exists('body', $payload)) {
            $body = trim((string) $payload['body']);
            if ('' === $body) {
                return $this->json(['detail' => 'Body cannot be empty.'], 422);
            }
            if (mb_strlen($body) > self::MAX_BODY) {
                return $this->json(['detail' => 'Body is too long.'], 422);
            }
            $campaign->setBody($body);
        }

        $campaign->touch();
        $this->em->flush();

        return $this->json($campaign->toArray());
    }

    #[Route('/campaigns/{id}', name: 'api_admin_newsletter_campaigns_delete', methods: ['DELETE'])]
    public function deleteCampaign(int $id): JsonResponse
    {
        $campaign = $this->campaigns->find($id);
        if (!$campaign instanceof NewsletterCampaign) {
            return $this->json(['detail' => 'Campaign not found.'], 404);
        }

        if (NewsletterCampaign::STATUS_SENDING === $campaign->getStatus()) {
            return $this->json(['detail' => 'Cannot delete a campaign while it is sending.'], 409);
        }

        $this->em->remove($campaign);
        $this->em->flush();

        return $this->json(null, 204);
    }

    #[Route('/campaigns/{id}/test', name: 'api_admin_newsletter_campaigns_test', methods: ['POST'])]
    public function testCampaign(Request $request, int $id): JsonResponse
    {
        $campaign = $this->campaigns->find($id);
        if (!$campaign instanceof NewsletterCampaign) {
            return $this->json(['detail' => 'Campaign not found.'], 404);
        }

        $payload = $request->toArray();
        $to = mb_strtolower(trim((string) ($payload['to'] ?? '')));
        if ('' === $to || !filter_var($to, \FILTER_VALIDATE_EMAIL)) {
            return $this->json(['detail' => 'A valid test email address is required.'], 422);
        }

        $this->broadcaster->sendTest($campaign, $to);

        return $this->json(['status' => 'sent', 'to' => $to], 202);
    }

    #[Route('/campaigns/{id}/broadcast', name: 'api_admin_newsletter_campaigns_broadcast', methods: ['POST'])]
    public function broadcastCampaign(int $id): JsonResponse
    {
        $campaign = $this->campaigns->find($id);
        if (!$campaign instanceof NewsletterCampaign) {
            return $this->json(['detail' => 'Campaign not found.'], 404);
        }

        if (!$campaign->isEditable()) {
            return $this->json(['detail' => 'This campaign has already been sent or is in progress.'], 409);
        }

        $active = $this->subscribers->stats()['active'];
        if (0 === $active) {
            return $this->json(['detail' => 'There are no active subscribers to email.'], 422);
        }

        $campaign
            ->setStatus(NewsletterCampaign::STATUS_SENDING)
            ->setSentCount(0)
            ->setFailedCount(0)
            ->setLastError(null)
            ->touch();
        $this->em->flush();

        $this->bus->dispatch(new SendNewsletterCampaignMessage((int) $campaign->getId()));

        return $this->json([
            'status' => 'queued',
            'campaign' => $campaign->toArray(),
            'recipientCount' => $active,
        ], 202);
    }

  /** @param array<string, mixed> $payload */
    private function validateCampaignPayload(array $payload): ?string
    {
        if ('' === trim((string) ($payload['subject'] ?? ''))) {
            return 'Subject is required.';
        }
        if ('' === trim((string) ($payload['body'] ?? ''))) {
            return 'Body is required.';
        }
        if (mb_strlen(trim((string) $payload['body'])) > self::MAX_BODY) {
            return 'Body is too long.';
        }

        return null;
    }

    private function optionalPreheader(mixed $value): ?string
    {
        if (null === $value) {
            return null;
        }
        $trimmed = trim((string) $value);

        return '' === $trimmed ? null : mb_substr($trimmed, 0, self::MAX_PREHEADER);
    }
}
