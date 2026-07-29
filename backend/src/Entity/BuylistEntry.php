<?php

namespace App\Entity;

use App\Repository\BuylistEntryRepository;
use App\Service\Catalog\FinishVocabulary;
use Doctrine\ORM\Mapping as ORM;

/**
 * One card a store wants to buy from customers, with the price it offers.
 * Curated per store on the admin Sell/Trade tab; browsed publicly on the
 * storefront sell/trade portal.
 */
#[ORM\Entity(repositoryClass: BuylistEntryRepository::class)]
#[ORM\Table(name: 'buylist_entries')]
#[ORM\UniqueConstraint(name: 'uniq_buylist_store_card_finish', columns: ['store_id', 'card_id', 'wants_finish'])]
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

    /**
     * Fixed per-copy offer override, in cents. When null the entry pays the
     * store's premium buy-list rate applied to the card's market price.
     */
    #[ORM\Column(nullable: true)]
    private ?int $offerCents = null;

    /** Inactive entries stay curated but disappear from the public portal. */
    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    /** Treatment the store is buying, in the game's words. */
    #[ORM\Column(name: 'wants_finish', length: FinishVocabulary::MAX_LENGTH, options: ['default' => FinishVocabulary::DEFAULT_PLAIN])]
    private string $wantsFinish = FinishVocabulary::DEFAULT_PLAIN;

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

    public function getOfferCents(): ?int { return $this->offerCents; }
    public function setOfferCents(?int $offerCents): static { $this->offerCents = null === $offerCents ? null : max(0, $offerCents); return $this; }

    public function isActive(): bool { return $this->active; }
    public function setActive(bool $active): static { $this->active = $active; return $this; }

    public function getWantsFinish(): string { return $this->wantsFinish; }
    public function setWantsFinish(string $finish): static { $this->wantsFinish = FinishVocabulary::canonical($finish) ?: FinishVocabulary::DEFAULT_PLAIN; return $this; }
    public function wantsFoil(): bool { return FinishVocabulary::isFoil($this->wantsFinish); }

    public function getMaxQuantity(): ?int { return $this->maxQuantity; }
    public function setMaxQuantity(?int $maxQuantity): static { $this->maxQuantity = $maxQuantity; return $this; }

    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $notes): static { $this->notes = $notes; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
