<?php

namespace App\Entity;

use App\Repository\OrderLineRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: OrderLineRepository::class)]
#[ORM\Table(name: 'order_lines')]
class OrderLine
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['order:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'lines')]
    #[ORM\JoinColumn(name: 'order_id', nullable: false)]
    private ?Order $parentOrder = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    #[Groups(['order:read'])]
    private ?Card $card = null;

    /**
     * The store listing this line was sold from. Links the order back to
     * stock so cancel/refund can restock; SET NULL keeps historical orders
     * intact if the listing is later deleted.
     */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?InventoryItem $inventoryItem = null;

    /**
     * When (part of) this line was sold out of a display-case section, the
     * section pool it depleted. SET NULL keeps history when a section is
     * dismantled; the caseName/sectionTitle snapshots below preserve what
     * staff need on print sheets regardless.
     */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?StoreSectionCard $sectionCard = null;

    #[ORM\Column(length: 120, nullable: true)]
    #[Groups(['order:read'])]
    private ?string $caseName = null;

    #[ORM\Column(length: 120, nullable: true)]
    #[Groups(['order:read'])]
    private ?string $sectionTitle = null;

    /** How many of this line's copies come out of the case section's pool. */
    #[ORM\Column(options: ['default' => 0])]
    #[Groups(['order:read'])]
    private int $caseQuantity = 0;

    #[ORM\Column(length: 255)]
    #[Groups(['order:read'])]
    private string $cardName = '';

    #[ORM\Column]
    #[Assert\Positive]
    #[Groups(['order:read'])]
    private int $quantity = 1;

    #[ORM\Column]
    #[Assert\PositiveOrZero]
    #[Groups(['order:read'])]
    private int $priceCents = 0;

    /**
     * Per-unit acquisition cost snapshotted from the listing at sale time,
     * so COGS reporting survives later repricing and listing deletion. Null
     * when the listing had no cost tracked (or the line was off-catalog).
     * order:read is store-staff only — customer endpoints serialize orders
     * by hand and never expose cost.
     */
    #[ORM\Column(nullable: true)]
    #[Groups(['order:read'])]
    private ?int $acquisitionCostCents = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getParentOrder(): ?Order
    {
        return $this->parentOrder;
    }

    public function setParentOrder(?Order $parentOrder): static
    {
        $this->parentOrder = $parentOrder;

        return $this;
    }

    public function getCard(): ?Card
    {
        return $this->card;
    }

    public function setCard(?Card $card): static
    {
        $this->card = $card;

        return $this;
    }

    public function getInventoryItem(): ?InventoryItem
    {
        return $this->inventoryItem;
    }

    public function setInventoryItem(?InventoryItem $inventoryItem): static
    {
        $this->inventoryItem = $inventoryItem;

        return $this;
    }

    public function getSectionCard(): ?StoreSectionCard
    {
        return $this->sectionCard;
    }

    public function setSectionCard(?StoreSectionCard $sectionCard): static
    {
        $this->sectionCard = $sectionCard;

        return $this;
    }

    public function getCaseName(): ?string
    {
        return $this->caseName;
    }

    public function setCaseName(?string $caseName): static
    {
        $this->caseName = $caseName;

        return $this;
    }

    public function getSectionTitle(): ?string
    {
        return $this->sectionTitle;
    }

    public function setSectionTitle(?string $sectionTitle): static
    {
        $this->sectionTitle = $sectionTitle;

        return $this;
    }

    public function getCaseQuantity(): int
    {
        return $this->caseQuantity;
    }

    public function setCaseQuantity(int $caseQuantity): static
    {
        $this->caseQuantity = max(0, $caseQuantity);

        return $this;
    }

    public function getCardName(): string
    {
        return $this->cardName;
    }

    public function setCardName(string $cardName): static
    {
        $this->cardName = $cardName;

        return $this;
    }

    public function getQuantity(): int
    {
        return $this->quantity;
    }

    public function setQuantity(int $quantity): static
    {
        $this->quantity = $quantity;

        return $this;
    }

    public function getPriceCents(): int
    {
        return $this->priceCents;
    }

    public function setPriceCents(int $priceCents): static
    {
        $this->priceCents = $priceCents;

        return $this;
    }

    public function getAcquisitionCostCents(): ?int
    {
        return $this->acquisitionCostCents;
    }

    public function setAcquisitionCostCents(?int $acquisitionCostCents): static
    {
        $this->acquisitionCostCents = $acquisitionCostCents;

        return $this;
    }

    /** @return array<string, mixed>|null */
    #[Groups(['order:read'])]
    public function getImageUris(): ?array
    {
        return $this->card?->getImageUris();
    }

    #[Groups(['order:read'])]
    public function getSetCode(): ?string
    {
        return $this->card?->getSetCode();
    }

    #[Groups(['order:read'])]
    public function getCollectorNumber(): ?string
    {
        return $this->card?->getCollectorNumber();
    }
}
