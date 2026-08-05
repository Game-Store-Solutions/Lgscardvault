<?php

namespace App\Entity;

use App\Repository\SubscriptionChargeRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

/**
 * One attempt to collect a store's subscription, successful or not.
 *
 * The Store row only ever holds the current state — when the next bill is due
 * and whether the last attempt failed. This is the history behind it, so the
 * platform admin can answer "did this store pay in June?" and "what did we
 * collect last month?" rather than only "are they in good standing today".
 */
#[ORM\Entity(repositoryClass: SubscriptionChargeRepository::class)]
#[ORM\Table(name: 'subscription_charges')]
#[ORM\Index(name: 'IDX_SUBSCRIPTION_CHARGE_CREATED', fields: ['createdAt'])]
class SubscriptionCharge
{
    public const STATUS_PAID = 'paid';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['billing:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    #[ORM\Column(length: 32, nullable: true)]
    #[Groups(['billing:read'])]
    private ?string $planKey = null;

    #[ORM\Column]
    #[Groups(['billing:read'])]
    private int $amountCents = 0;

    #[ORM\Column(length: 16)]
    #[Groups(['billing:read'])]
    private string $status = self::STATUS_PAID;

    /** Processor payment id. Null when the attempt never got that far. */
    #[ORM\Column(length: 128, nullable: true)]
    #[Groups(['billing:read'])]
    private ?string $reference = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['billing:read'])]
    private ?string $failureReason = null;

    /** Which dunning attempt this was; 0 for a first, on-time collection. */
    #[ORM\Column(options: ['default' => 0])]
    #[Groups(['billing:read'])]
    private int $attempt = 0;

    #[ORM\Column]
    #[Groups(['billing:read'])]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public static function paid(Store $store, int $amountCents, string $reference, int $attempt = 0): self
    {
        $charge = new self();
        $charge->store = $store;
        $charge->planKey = $store->getPlanKey();
        $charge->amountCents = $amountCents;
        $charge->status = self::STATUS_PAID;
        $charge->reference = $reference;
        $charge->attempt = $attempt;

        return $charge;
    }

    public static function failed(Store $store, int $amountCents, string $reason, int $attempt): self
    {
        $charge = new self();
        $charge->store = $store;
        $charge->planKey = $store->getPlanKey();
        $charge->amountCents = $amountCents;
        $charge->status = self::STATUS_FAILED;
        $charge->failureReason = mb_substr($reason, 0, 500);
        $charge->attempt = $attempt;

        return $charge;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getStore(): ?Store
    {
        return $this->store;
    }

    public function getPlanKey(): ?string
    {
        return $this->planKey;
    }

    public function getAmountCents(): int
    {
        return $this->amountCents;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function isPaid(): bool
    {
        return self::STATUS_PAID === $this->status;
    }

    public function getReference(): ?string
    {
        return $this->reference;
    }

    public function getFailureReason(): ?string
    {
        return $this->failureReason;
    }

    public function getAttempt(): int
    {
        return $this->attempt;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
