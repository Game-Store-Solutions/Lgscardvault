<?php

namespace App\Entity;

use App\Repository\PaypalWebhookEventRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: PaypalWebhookEventRepository::class)]
#[ORM\Table(name: 'paypal_webhook_events')]
#[ORM\UniqueConstraint(name: 'UNIQ_PAYPAL_WEBHOOK_EVENT', fields: ['eventId'])]
#[ORM\Index(name: 'IDX_PAYPAL_WEBHOOK_TYPE', fields: ['type'])]
class PaypalWebhookEvent
{
    public const STATUS_PROCESSED = 'processed';
    public const STATUS_IGNORED = 'ignored';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 128)]
    private string $eventId;

    #[ORM\Column(length: 64)]
    private string $type;

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $merchantId = null;

    #[ORM\Column(length: 16)]
    private string $status = self::STATUS_IGNORED;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $note = null;

    #[ORM\Column]
    private \DateTimeImmutable $receivedAt;

    public function __construct(string $eventId, string $type, ?string $merchantId = null)
    {
        $this->eventId = $eventId;
        $this->type = $type;
        $this->merchantId = $merchantId;
        $this->receivedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEventId(): string
    {
        return $this->eventId;
    }

    public function getType(): string
    {
        return $this->type;
    }

    public function getMerchantId(): ?string
    {
        return $this->merchantId;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function getNote(): ?string
    {
        return $this->note;
    }

    public function getReceivedAt(): \DateTimeImmutable
    {
        return $this->receivedAt;
    }

    public function markOutcome(string $status, ?string $note = null): static
    {
        $this->status = $status;
        $this->note = null === $note ? null : mb_substr($note, 0, 500);

        return $this;
    }
}
