<?php

namespace App\Controller;

use App\Entity\NewsletterSubscriber;
use App\Security\ApiRateLimit;
use App\Service\Mail\TransactionalMailer;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api')]
final class NewsletterController extends AbstractController
{
    private const MAX_EMAIL = 180;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly TransactionalMailer $mailer,
        #[Autowire(service: 'limiter.newsletter_signup')]
        private readonly RateLimiterFactoryInterface $newsletterLimiter,
    ) {
    }

    #[Route('/newsletter', name: 'api_newsletter_subscribe', methods: ['POST'])]
    public function subscribe(Request $request): JsonResponse
    {
        if (null !== $response = ApiRateLimit::enforce($this->newsletterLimiter, 'ip:'.$request->getClientIp())) {
            return $response;
        }

        $payload = $request->toArray();
        $email = mb_strtolower(trim((string) ($payload['email'] ?? '')));
        $source = trim((string) ($payload['source'] ?? 'landing'));

        if ('' === $email) {
            return $this->json(['detail' => 'Email is required.'], 422);
        }

        if (!filter_var($email, \FILTER_VALIDATE_EMAIL)) {
            return $this->json(['detail' => 'Enter a valid email address.'], 422);
        }

        if (mb_strlen($email) > self::MAX_EMAIL) {
            return $this->json(['detail' => 'That email address is too long.'], 422);
        }

        $source = '' === $source ? 'landing' : mb_substr($source, 0, 32);

        $created = false;
        try {
            $this->em->persist(new NewsletterSubscriber($email, $source));
            $this->em->flush();
            $created = true;
        } catch (UniqueConstraintViolationException) {
            // Already subscribed — respond the same so we do not leak addresses.
        }

        if ($created) {
            $this->notifyTeam($email, $source);
        }

        return $this->json(['status' => 'subscribed'], 202);
    }

    private function notifyTeam(string $email, string $source): void
    {
        $recipients = $this->recipients();
        if ([] === $recipients) {
            return;
        }

        foreach ($recipients as $recipient) {
            $this->mailer->sendHtml(
                to: $recipient,
                subject: 'New newsletter signup',
                htmlTemplate: 'emails/platform/newsletter_signup.html.twig',
                context: [
                    'preheader' => sprintf('%s joined the newsletter.', $email),
                    'email' => $email,
                    'source' => $source,
                    'footerNote' => 'Sent from the LGS Card Vault newsletter form.',
                ],
                textBody: sprintf("Newsletter signup\n\nEmail: %s\nSource: %s\n", $email, $source),
                store: null,
            );
        }
    }

    /**
     * @return list<string>
     */
    private function recipients(): array
    {
        $raw = trim((string) ($_ENV['APP_NEWSLETTER_RECIPIENTS'] ?? $_SERVER['APP_NEWSLETTER_RECIPIENTS'] ?? ''));
        if ('' === $raw) {
            $raw = trim((string) ($_ENV['APP_CONTACT_RECIPIENTS'] ?? $_SERVER['APP_CONTACT_RECIPIENTS'] ?? ''));
        }
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
