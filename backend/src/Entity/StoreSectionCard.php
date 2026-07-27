<?php

namespace App\Entity;

use App\Repository\StoreSectionCardRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One inventory listing placed in a StoreSection, at a given position. Cascades
 * away with its section, and with the underlying inventory listing (so a card
 * that leaves inventory silently drops out of every case section).
 */
#[ORM\Entity(repositoryClass: StoreSectionCardRepository::class)]
#[ORM\Table(name: 'store_section_cards')]
#[ORM\UniqueConstraint(name: 'uniq_section_inventory_item', columns: ['section_id', 'inventory_item_id'])]
class StoreSectionCard
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'cards')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?StoreSection $section = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?InventoryItem $inventoryItem = null;

    #[ORM\Column]
    private int $position = 0;

    /**
     * Copies of this listing physically allocated to the section — the
     * section's own inventory pool for this card (default 1: one display-case
     * slot). Independent of the listing's total stock.
     */
    #[ORM\Column(options: ['default' => 1])]
    private int $quantity = 1;

    /**
     * Copies sold out of this section's pool (incremented at order placement,
     * decremented when an order is cancelled/refunded). remaining() is what
     * the storefront can still sell "from the case"; sales beyond it fall
     * back to regular inventory, so the pool can never be oversold.
     */
    #[ORM\Column(options: ['default' => 0])]
    private int $soldQuantity = 0;

    /**
     * When staff confirmed this card's copies are physically placed in the
     * display case. Null = just added (or topped up) by auto-fill/manual add
     * and still waiting to be pulled from stock — the section's stocking
     * sheet lists exactly these rows.
     */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $stockedAt = null;

    public function getId(): ?int { return $this->id; }

    public function getSection(): ?StoreSection { return $this->section; }
    public function setSection(?StoreSection $section): static { $this->section = $section; return $this; }

    public function getInventoryItem(): ?InventoryItem { return $this->inventoryItem; }
    public function setInventoryItem(?InventoryItem $item): static { $this->inventoryItem = $item; return $this; }

    public function getPosition(): int { return $this->position; }
    public function setPosition(int $position): static { $this->position = $position; return $this; }

    public function getQuantity(): int { return $this->quantity; }
    public function setQuantity(int $quantity): static { $this->quantity = max(0, $quantity); return $this; }

    public function getSoldQuantity(): int { return $this->soldQuantity; }
    public function setSoldQuantity(int $soldQuantity): static { $this->soldQuantity = max(0, $soldQuantity); return $this; }

    public function getStockedAt(): ?\DateTimeImmutable { return $this->stockedAt; }
    public function setStockedAt(?\DateTimeImmutable $stockedAt): static { $this->stockedAt = $stockedAt; return $this; }

    /** Copies still available to sell from this section's pool. */
    public function remaining(): int
    {
        return max(0, $this->quantity - $this->soldQuantity);
    }

    /**
     * True when staff still need to place this card in the physical case.
     * Frozen rows (pool fully sold) never need stocking regardless of state.
     */
    public function needsStocking(): bool
    {
        return null === $this->stockedAt && $this->remaining() > 0;
    }
}
