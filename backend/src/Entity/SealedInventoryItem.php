<?php

namespace App\Entity;

use App\Repository\SealedInventoryItemRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * A store's stock of one sealed product — deliberately separate from the
 * singles InventoryItem table (different pricing model: no condition/foil
 * axes, priced per box/bundle against the TCGplayer market snapshot).
 */
#[ORM\Entity(repositoryClass: SealedInventoryItemRepository::class)]
#[ORM\Table(name: 'sealed_inventory_items')]
#[ORM\UniqueConstraint(name: 'uniq_sealed_inventory_line', columns: ['store_id', 'sealed_product_id'])]
#[ORM\Index(name: 'idx_sealed_inventory_store', columns: ['store_id'])]
class SealedInventoryItem
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
    private ?SealedProduct $sealedProduct = null;

    #[ORM\Column(options: ['default' => 0])]
    private int $quantity = 0;

    /** Store's asking price in cents. */
    #[ORM\Column(options: ['default' => 0])]
    private int $priceCents = 0;

    /** What the store paid per unit, for margin reporting (nullable). */
    #[ORM\Column(nullable: true)]
    private ?int $acquisitionCostCents = null;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getStore(): ?Store { return $this->store; }
    public function setStore(?Store $store): static { $this->store = $store; return $this; }

    public function getSealedProduct(): ?SealedProduct { return $this->sealedProduct; }
    public function setSealedProduct(?SealedProduct $sealedProduct): static { $this->sealedProduct = $sealedProduct; return $this; }

    public function getQuantity(): int { return $this->quantity; }
    public function setQuantity(int $quantity): static { $this->quantity = max(0, $quantity); return $this; }

    public function getPriceCents(): int { return $this->priceCents; }
    public function setPriceCents(int $priceCents): static { $this->priceCents = max(0, $priceCents); return $this; }

    public function getAcquisitionCostCents(): ?int { return $this->acquisitionCostCents; }
    public function setAcquisitionCostCents(?int $acquisitionCostCents): static { $this->acquisitionCostCents = $acquisitionCostCents; return $this; }

    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): static { $this->updatedAt = new \DateTimeImmutable(); return $this; }
}
