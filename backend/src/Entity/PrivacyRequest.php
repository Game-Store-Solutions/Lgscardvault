<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'privacy_requests')]
class PrivacyRequest
{
    public const TYPE_ACCESS = 'access';
    public const TYPE_DELETE = 'delete';
    public const TYPE_DO_NOT_SELL = 'do_not_sell';
    public const TYPE_CORRECT = 'correct';
    public const TYPES = [self::TYPE_ACCESS, self::TYPE_DELETE, self::TYPE_DO_NOT_SELL, self::TYPE_CORRECT];

    public const STATUS_RECEIVED = 'received';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_REJECTED = 'rejected';
    public const STATUSES = [self::STATUS_RECEIVED, self::STATUS_IN_PROGRESS, self::STATUS_COMPLETED, self::STATUS_REJECTED];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 32)]
    private string $type;

    #[ORM\Column(length: 32)]
    private string $status = self::STATUS_RECEIVED;

    #[ORM\Column(length: 180)]
    private string $email;

    #[ORM\Column(length: 120)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $details = null;

    #[ORM\Column]
    private bool $californiaResident = false;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $adminNotes = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $completedAt = null;

    public function __construct(string $type, string $email, string $name)
    {
        $this->type = $type;
        $this->email = $email;
        $this->name = $name;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getType(): string
    {
        return $this->type;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): static
    {
        $this->status = $status;
        if (self::STATUS_COMPLETED === $status || self::STATUS_REJECTED === $status) {
            $this->completedAt = new \DateTimeImmutable();
        }

        return $this;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getDetails(): ?string
    {
        return $this->details;
    }

    public function setDetails(?string $details): static
    {
        $this->details = $details;

        return $this;
    }

    public function isCaliforniaResident(): bool
    {
        return $this->californiaResident;
    }

    public function setCaliforniaResident(bool $californiaResident): static
    {
        $this->californiaResident = $californiaResident;

        return $this;
    }

    public function getAdminNotes(): ?string
    {
        return $this->adminNotes;
    }

    public function setAdminNotes(?string $adminNotes): static
    {
        $this->adminNotes = $adminNotes;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getCompletedAt(): ?\DateTimeImmutable
    {
        return $this->completedAt;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'status' => $this->status,
            'email' => $this->email,
            'name' => $this->name,
            'details' => $this->details,
            'californiaResident' => $this->californiaResident,
            'adminNotes' => $this->adminNotes,
            'createdAt' => $this->createdAt->format(DATE_ATOM),
            'completedAt' => $this->completedAt?->format(DATE_ATOM),
        ];
    }
}
