<?php

namespace App\Entity;

use App\Repository\NewsletterCampaignRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: NewsletterCampaignRepository::class)]
#[ORM\Table(name: 'newsletter_campaigns')]
class NewsletterCampaign
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_SENDING = 'sending';
    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 160)]
    private string $subject = '';

    #[ORM\Column(length: 200, nullable: true)]
    private ?string $preheader = null;

    #[ORM\Column(type: 'text')]
    private string $body = '';

    #[ORM\Column(length: 16)]
    private string $status = self::STATUS_DRAFT;

    #[ORM\Column]
    private int $sentCount = 0;

    #[ORM\Column]
    private int $failedCount = 0;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $updatedAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $sentAt = null;

    #[ORM\Column(nullable: true)]
    private ?string $lastError = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSubject(): string
    {
        return $this->subject;
    }

    public function setSubject(string $subject): static
    {
        $this->subject = $subject;

        return $this;
    }

    public function getPreheader(): ?string
    {
        return $this->preheader;
    }

    public function setPreheader(?string $preheader): static
    {
        $this->preheader = $preheader;

        return $this;
    }

    public function getBody(): string
    {
        return $this->body;
    }

    public function setBody(string $body): static
    {
        $this->body = $body;

        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): static
    {
        $this->status = $status;

        return $this;
    }

    public function getSentCount(): int
    {
        return $this->sentCount;
    }

    public function setSentCount(int $sentCount): static
    {
        $this->sentCount = $sentCount;

        return $this;
    }

    public function getFailedCount(): int
    {
        return $this->failedCount;
    }

    public function setFailedCount(int $failedCount): static
    {
        $this->failedCount = $failedCount;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function touch(): static
    {
        $this->updatedAt = new \DateTimeImmutable();

        return $this;
    }

    public function getSentAt(): ?\DateTimeImmutable
    {
        return $this->sentAt;
    }

    public function markSent(): static
    {
        $this->status = self::STATUS_SENT;
        $this->sentAt = new \DateTimeImmutable();

        return $this;
    }

    public function getLastError(): ?string
    {
        return $this->lastError;
    }

    public function setLastError(?string $lastError): static
    {
        $this->lastError = $lastError;

        return $this;
    }

    public function isEditable(): bool
    {
        return self::STATUS_DRAFT === $this->status || self::STATUS_FAILED === $this->status;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'preheader' => $this->preheader,
            'body' => $this->body,
            'status' => $this->status,
            'sentCount' => $this->sentCount,
            'failedCount' => $this->failedCount,
            'createdAt' => $this->createdAt->format(DATE_ATOM),
            'updatedAt' => $this->updatedAt?->format(DATE_ATOM),
            'sentAt' => $this->sentAt?->format(DATE_ATOM),
            'lastError' => $this->lastError,
            'editable' => $this->isEditable(),
        ];
    }
}
