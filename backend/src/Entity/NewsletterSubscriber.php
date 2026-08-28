<?php

namespace App\Entity;

use App\Repository\NewsletterSubscriberRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: NewsletterSubscriberRepository::class)]
#[ORM\Table(name: 'newsletter_subscribers')]
#[ORM\UniqueConstraint(name: 'uniq_newsletter_email', columns: ['email'])]
#[ORM\UniqueConstraint(name: 'uniq_newsletter_unsubscribe_token', columns: ['unsubscribe_token'])]
class NewsletterSubscriber
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 180)]
    private string $email;

    #[ORM\Column(length: 32, nullable: true)]
    private ?string $source = null;

    #[ORM\Column(length: 64)]
    private string $unsubscribeToken;

    #[ORM\Column]
    private \DateTimeImmutable $subscribedAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $unsubscribedAt = null;

    public function __construct(string $email, ?string $source = null)
    {
        $this->email = $email;
        $this->source = $source;
        $this->unsubscribeToken = bin2hex(random_bytes(32));
        $this->subscribedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getSource(): ?string
    {
        return $this->source;
    }

    public function getUnsubscribeToken(): string
    {
        return $this->unsubscribeToken;
    }

    public function getSubscribedAt(): \DateTimeImmutable
    {
        return $this->subscribedAt;
    }

    public function getUnsubscribedAt(): ?\DateTimeImmutable
    {
        return $this->unsubscribedAt;
    }

    public function isActive(): bool
    {
        return null === $this->unsubscribedAt;
    }

    public function resubscribe(?string $source = null): void
    {
        $this->unsubscribedAt = null;
        $this->subscribedAt = new \DateTimeImmutable();
        if (null !== $source && '' !== $source) {
            $this->source = mb_substr($source, 0, 32);
        }
        $this->unsubscribeToken = bin2hex(random_bytes(32));
    }

    public function unsubscribe(): void
    {
        $this->unsubscribedAt = new \DateTimeImmutable();
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'source' => $this->source,
            'subscribedAt' => $this->subscribedAt->format(DATE_ATOM),
            'unsubscribedAt' => $this->unsubscribedAt?->format(DATE_ATOM),
            'active' => $this->isActive(),
        ];
    }
}
