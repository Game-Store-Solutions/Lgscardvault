<?php

namespace App\Controller;

use App\Security\ApiRateLimit;
use App\Service\Mail\TransactionalMailer;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Public "contact us" form on the marketing landing page.
 *
 * The recipients live here rather than in the frontend bundle: a mailto: link
 * publishes the team's addresses to every scraper that loads the page. Rate
 * limited per IP so the form cannot be used to flood those inboxes.
 */
#[Route('/api')]
final class ContactController extends AbstractController
{
    private const MAX_NAME = 120;
    private const MAX_EMAIL = 180;
    private const MAX_MESSAGE = 4000;

    public function __construct(
        private readonly TransactionalMailer $mailer,
        #[Autowire(service: 'limiter.contact_form')]
        private readonly RateLimiterFactoryInterface $contactLimiter,
    ) {
    }

    #[Route('/contact', name: 'api_contact', methods: ['POST'])]
    public function submit(Request $request): JsonResponse
    {
        if (null !== $response = ApiRateLimit::enforce($this->contactLimiter, 'ip:'.$request->getClientIp())) {
            return $response;
        }

        $payload = $request->toArray();
        $name = trim((string) ($payload['name'] ?? ''));
        $email = trim((string) ($payload['email'] ?? ''));
        $message = trim((string) ($payload['message'] ?? ''));

        if ('' === $name || '' === $email || '' === $message) {
            return $this->json(['detail' => 'Name, email, and message are required.'], 422);
        }

        if (!filter_var($email, \FILTER_VALIDATE_EMAIL)) {
            return $this->json(['detail' => 'Enter a valid email address.'], 422);
        }

        if (mb_strlen($name) > self::MAX_NAME
            || mb_strlen($email) > self::MAX_EMAIL
            || mb_strlen($message) > self::MAX_MESSAGE
        ) {
            return $this->json(['detail' => 'That message is too long.'], 422);
        }

        $recipients = $this->recipients();
        if ([] === $recipients) {
            return $this->json(['detail' => 'Contact is not configured. Please try again later.'], 503);
        }

        $subject = sprintf('Marketplace enquiry from %s', $name);
        foreach ($recipients as $recipient) {
            $this->mailer->sendHtml(
                to: $recipient,
                subject: $subject,
                htmlTemplate: 'emails/platform/contact_enquiry.html.twig',
                context: [
                    'preheader' => sprintf('%s got in touch via the landing page.', $name),
                    'senderName' => $name,
                    'senderEmail' => $email,
                    'messageBody' => $message,
                    'footerNote' => 'Sent from the LGS Card Vault contact form.',
                ],
                textBody: sprintf("From: %s <%s>\n\n%s\n", $name, $email, $message),
                store: null,
            );
        }

        return $this->json(['status' => 'sent'], 202);
    }

    /**
     * Recipients from APP_CONTACT_RECIPIENTS (comma separated), falling back to
     * the platform owners so a fresh deploy still delivers enquiries.
     *
     * @return list<string>
     */
    private function recipients(): array
    {
        $raw = trim((string) ($_ENV['APP_CONTACT_RECIPIENTS'] ?? $_SERVER['APP_CONTACT_RECIPIENTS'] ?? ''));
        if ('' === $raw) {
            $raw = 'tedy@gamestoresolutions.com,robert@gamestoresolutions.com';
        }

        $valid = [];
        foreach (explode(',', $raw) as $candidate) {
            $candidate = trim($candidate);
            if ('' !== $candidate && filter_var($candidate, \FILTER_VALIDATE_EMAIL)) {
                $valid[] = $candidate;
            }
        }

        return array_values(array_unique($valid));
    }
}
