<?php

namespace App\Entity;

use App\Repository\SellSubmissionRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

/**
 * A customer's offer to sell cards to a store via the sell/trade portal.
 * Lines snapshot the buylist offer at submission time, so a store editing
 * its buylist later never rewrites an in-flight submission's value.
 */
#[ORM\Entity(repositoryClass: SellSubmissionRepository::class)]
#[ORM\Table(name: 'sell_submissions')]
#[ORM\Index(name: 'idx_sell_submission_store_status', columns: ['store_id', 'status'])]
class SellSubmission
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_ACCEPTED = 'accepted';
    public const STATUS_DECLINED = 'declined';
    public const STATUS_COMPLETED = 'completed';
    public const STATUSES = [self::STATUS_PENDING, self::STATUS_ACCEPTED, self::STATUS_DECLINED, self::STATUS_COMPLETED];

    /** Statuses staff may move a submission to, from a given status. */
    public const TRANSITIONS = [
        self::STATUS_PENDING => [self::STATUS_ACCEPTED, self::STATUS_DECLINED],
        self::STATUS_ACCEPTED => [self::STATUS_COMPLETED, self::STATUS_DECLINED],
        self::STATUS_DECLINED => [],
        self::STATUS_COMPLETED => [],
    ];

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

    #[ORM\Column(length: 16, options: ['default' => self::STATUS_PENDING])]
    private string $status = self::STATUS_PENDING;

    /** Total cash offer snapshot across all lines, in cents. */
    #[ORM\Column]
    private int $totalOfferCents = 0;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $decidedAt = null;

    /** @var Collection<int, SellSubmissionItem> */
    #[ORM\OneToMany(mappedBy: 'submission', targetEntity: SellSubmissionItem::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $items;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->items = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }

    public function getStore(): ?Store { return $this->store; }
    public function setStore(?Store $store): static { $this->store = $store; return $this; }

    public function getUser(): ?User { return $this->user; }
    public function setUser(?User $user): static { $this->user = $user; return $this; }

    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): static { $this->status = $status; return $this; }

    public function getTotalOfferCents(): int { return $this->totalOfferCents; }
    public function setTotalOfferCents(int $totalOfferCents): static { $this->totalOfferCents = $totalOfferCents; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function getDecidedAt(): ?\DateTimeImmutable { return $this->decidedAt; }
    public function setDecidedAt(?\DateTimeImmutable $decidedAt): static { $this->decidedAt = $decidedAt; return $this; }

    /** @return Collection<int, SellSubmissionItem> */
    public function getItems(): Collection { return $this->items; }

    public function addItem(SellSubmissionItem $item): static
    {
        if (!$this->items->contains($item)) {
            $this->items->add($item);
            $item->setSubmission($this);
        }

        return $this;
    }
}
