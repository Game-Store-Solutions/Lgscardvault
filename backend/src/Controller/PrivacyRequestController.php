<?php

namespace App\Controller;

use App\Entity\PrivacyRequest;
use App\Security\ApiRateLimit;
use App\Service\Mail\TransactionalMailer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api')]
final class PrivacyRequestController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly TransactionalMailer $mailer,
        #[Autowire(service: 'limiter.privacy_request')]
        private readonly RateLimiterFactoryInterface $limiter,
    ) {
    }

    #[Route('/privacy/requests', name: 'api_privacy_request_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        if (null !== $response = ApiRateLimit::enforce($this->limiter, 'ip:'.$request->getClientIp())) {
            return $response;
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $type = trim((string) ($payload['type'] ?? ''));
        $email = trim((string) ($payload['email'] ?? ''));
        $name = mb_substr(trim((string) ($payload['name'] ?? '')), 0, 120);
        $details = mb_substr(trim((string) ($payload['details'] ?? '')), 0, 4000);

        if (!in_array($type, PrivacyRequest::TYPES, true)) {
            return $this->json(['detail' => 'Choose access, delete, do_not_sell, correct, or takedown.'], 422);
        }
        if ('' === $name || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->json(['detail' => 'Name and a valid email are required.'], 422);
        }

        $row = (new PrivacyRequest($type, mb_substr($email, 0, 180), $name))
            ->setDetails('' !== $details ? $details : null)
            ->setCaliforniaResident((bool) ($payload['californiaResident'] ?? false));
        $this->entityManager->persist($row);
        $this->entityManager->flush();

        $recipients = $this->recipients();
        foreach ($recipients as $recipient) {
            try {
                $this->mailer->sendHtml(
                    to: $recipient,
                    subject: sprintf(
                        '%s (%s) from %s',
                        PrivacyRequest::TYPE_TAKEDOWN === $type ? 'Publisher takedown' : 'Privacy request',
                        $type,
                        $name,
                    ),
                    htmlTemplate: 'emails/platform/contact_enquiry.html.twig',
                    context: [
                        'preheader' => PrivacyRequest::TYPE_TAKEDOWN === $type
                            ? 'A publisher / rights-holder takedown was submitted.'
                            : 'A CCPA / privacy request was submitted.',
                        'senderName' => $name,
                        'senderEmail' => $email,
                        'messageBody' => sprintf("Type: %s\nCalifornia resident: %s\n\n%s", $type, $row->isCaliforniaResident() ? 'yes' : 'no', $details),
                        'footerNote' => 'Submitted from the LGS Card Vault privacy request form.',
                    ],
                    textBody: sprintf("Type: %s\nFrom: %s <%s>\n\n%s\n", $type, $name, $email, $details),
                    store: null,
                );
            } catch (\Throwable) {
                // The request is stored even if mail fails.
            }
        }

        return $this->json([
            'status' => 'received',
            'reference' => $row->getId(),
            'detail' => 'We received your request. We will email this address within 45 days.',
        ], 202);
    }

    #[Route('/admin/privacy-requests', name: 'api_admin_privacy_requests', methods: ['GET'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function list(): JsonResponse
    {
        $rows = $this->entityManager->getRepository(PrivacyRequest::class)->findBy([], ['createdAt' => 'DESC'], 100);

        return $this->json(array_map(static fn (PrivacyRequest $row): array => $row->toArray(), $rows));
    }

    #[Route('/admin/privacy-requests/{id}', name: 'api_admin_privacy_request_update', methods: ['PATCH'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function update(int $id, Request $request): JsonResponse
    {
        $row = $this->entityManager->find(PrivacyRequest::class, $id);
        if (!$row instanceof PrivacyRequest) {
            return $this->json(['detail' => 'Request not found.'], 404);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $status = trim((string) ($payload['status'] ?? ''));
        if ('' !== $status) {
            if (!in_array($status, PrivacyRequest::STATUSES, true)) {
                return $this->json(['detail' => 'Unknown status.'], 422);
            }
            $row->setStatus($status);
        }
        if (array_key_exists('adminNotes', $payload)) {
            $notes = trim((string) $payload['adminNotes']);
            $row->setAdminNotes('' === $notes ? null : mb_substr($notes, 0, 4000));
        }
        $this->entityManager->flush();

        return $this->json($row->toArray());
    }

    /** @return list<string> */
    private function recipients(): array
    {
        $raw = trim((string) ($_ENV['APP_CONTACT_RECIPIENTS'] ?? $_SERVER['APP_CONTACT_RECIPIENTS'] ?? ''));
        if ('' === $raw) {
            $raw = (string) ($_ENV['LEGAL_CONTACT_EMAIL'] ?? $_SERVER['LEGAL_CONTACT_EMAIL'] ?? '');
        }

        $valid = [];
        foreach (explode(',', $raw) as $candidate) {
            $candidate = trim($candidate);
            if ('' !== $candidate && filter_var($candidate, FILTER_VALIDATE_EMAIL)) {
                $valid[] = $candidate;
            }
        }

        return array_values(array_unique($valid));
    }
}
