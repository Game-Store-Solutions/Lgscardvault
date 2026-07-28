<?php

namespace App\Entity;

use App\Repository\CartItemRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One line in a customer's per-store shopping cart: either a singles
 * listing or a sealed listing, plus the number of copies wanted. Exactly
 * one of the two listing references is set. Quantity is clamped to
 * available stock at write time.
 */
#[ORM\Entity(repositoryClass: CartItemRepository::class)]
#[ORM\Table(name: 'cart_items')]
#[ORM\UniqueConstraint(name: 'UNIQ_CART_CUSTOMER_ITEM', fields: ['customer', 'inventoryItem'])]
#[ORM\UniqueConstraint(name: 'uniq_cart_customer_sealed', fields: ['customer', 'sealedInventoryItem'])]
class CartItem
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'cartItems')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?StoreCustomer $customer = null;

    /** Singles listing; null on sealed lines. */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?InventoryItem $inventoryItem = null;

    /** Sealed listing; null on singles lines. */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?SealedInventoryItem $sealedInventoryItem = null;

    #[ORM\Column]
    private int $quantity = 1;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getCustomer(): ?StoreCustomer
    {
        return $this->customer;
    }

    public function setCustomer(?StoreCustomer $customer): static
    {
        $this->customer = $customer;

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

    public function getSealedInventoryItem(): ?SealedInventoryItem
    {
        return $this->sealedInventoryItem;
    }

    public function setSealedInventoryItem(?SealedInventoryItem $sealedInventoryItem): static
    {
        $this->sealedInventoryItem = $sealedInventoryItem;

        return $this;
    }

    public function isSealed(): bool
    {
        return null !== $this->sealedInventoryItem;
    }

    /** Copies this line's listing still has on hand, whichever kind it is. */
    public function availableStock(): int
    {
        return $this->sealedInventoryItem?->getQuantity() ?? $this->inventoryItem?->getQuantity() ?? 0;
    }

    /** Unit price of this line's listing, in cents. */
    public function unitPriceCents(): int
    {
        return $this->sealedInventoryItem?->getPriceCents() ?? $this->inventoryItem?->getPriceCents() ?? 0;
    }

    public function getQuantity(): int
    {
        return $this->quantity;
    }

    public function setQuantity(int $quantity): static
    {
        $this->quantity = max(1, $quantity);
        $this->updatedAt = new \DateTimeImmutable();

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }
}
