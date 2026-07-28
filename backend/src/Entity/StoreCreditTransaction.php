<?php

namespace App\Entity;

use App\Repository\StoreCreditTransactionRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One movement on a customer's store-credit balance at one store. The
 * balance is always the sum of a customer's transactions — never a stored
 * number that can drift. Positive amounts add credit (sell/trade payouts,
 * staff adjustments), negative amounts spend it (checkout).
 */
#[ORM\Entity(repositoryClass: StoreCreditTransactionRepository::class)]
#[ORM\Table(name: 'store_credit_transactions')]
#[ORM\Index(name: 'idx_store_credit_user_store', columns: ['user_id', 'store_id', 'created_at'])]
class StoreCreditTransaction
{
    public const KIND_SELL_SUBMISSION = 'sell_submission';
    public const KIND_ORDER = 'order';
    public const KIND_ADJUSTMENT = 'adjustment';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $user = null;

    /** Signed cents: positive grants credit, negative spends it. */
    #[ORM\Column]
    private int $amountCents = 0;

    #[ORM\Column(length: 24)]
    private string $kind = self::KIND_ADJUSTMENT;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?SellSubmission $sellSubmission = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Order $order = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $note = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getStore(): ?Store { return $this->store; }
    public function setStore(?Store $store): static { $this->store = $store; return $this; }

    public function getUser(): ?User { return $this->user; }
    public function setUser(?User $user): static { $this->user = $user; return $this; }

    public function getAmountCents(): int { return $this->amountCents; }
    public function setAmountCents(int $amountCents): static { $this->amountCents = $amountCents; return $this; }

    public function getKind(): string { return $this->kind; }
    public function setKind(string $kind): static { $this->kind = $kind; return $this; }

    public function getSellSubmission(): ?SellSubmission { return $this->sellSubmission; }
    public function setSellSubmission(?SellSubmission $sellSubmission): static { $this->sellSubmission = $sellSubmission; return $this; }

    public function getOrder(): ?Order { return $this->order; }
    public function setOrder(?Order $order): static { $this->order = $order; return $this; }

    public function getNote(): ?string { return $this->note; }
    public function setNote(?string $note): static { $this->note = $note; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
