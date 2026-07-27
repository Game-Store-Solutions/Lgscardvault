<?php

namespace App\Entity;

use App\Repository\BuylistEntryRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One card a store wants to buy from customers, with the price it offers.
 * Curated per store on the admin Sell/Trade tab; browsed publicly on the
 * storefront sell/trade portal.
 */
#[ORM\Entity(repositoryClass: BuylistEntryRepository::class)]
#[ORM\Table(name: 'buylist_entries')]
#[ORM\UniqueConstraint(name: 'uniq_buylist_store_card_foil', columns: ['store_id', 'card_id', 'wants_foil'])]
class BuylistEntry
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Card $card = null;

    /** What the store pays per copy (cash offer), in cents. */
    #[ORM\Column]
    private int $offerCents = 0;

    #[ORM\Column(name: 'wants_foil')]
    private bool $wantsFoil = false;

    /** Max copies the store wants; null = no cap. */
    #[ORM\Column(nullable: true)]
    private ?int $maxQuantity = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $notes = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getStore(): ?Store { return $this->store; }
    public function setStore(?Store $store): static { $this->store = $store; return $this; }

    public function getCard(): ?Card { return $this->card; }
    public function setCard(?Card $card): static { $this->card = $card; return $this; }

    public function getOfferCents(): int { return $this->offerCents; }
    public function setOfferCents(int $offerCents): static { $this->offerCents = max(0, $offerCents); return $this; }

    public function wantsFoil(): bool { return $this->wantsFoil; }
    public function setWantsFoil(bool $wantsFoil): static { $this->wantsFoil = $wantsFoil; return $this; }

    public function getMaxQuantity(): ?int { return $this->maxQuantity; }
    public function setMaxQuantity(?int $maxQuantity): static { $this->maxQuantity = $maxQuantity; return $this; }

    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $notes): static { $this->notes = $notes; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
