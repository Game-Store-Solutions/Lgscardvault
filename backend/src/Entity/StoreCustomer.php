<?php

namespace App\Entity;

use App\Repository\StoreCustomerRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: StoreCustomerRepository::class)]
#[ORM\Table(name: 'store_customers')]
#[ORM\UniqueConstraint(name: 'UNIQ_STORE_CUSTOMER_USER_STORE', fields: ['user', 'store'])]
class StoreCustomer
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $user = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $shippingAddress = null;

    #[ORM\Column(length: 40, nullable: true)]
    private ?string $paymentBrand = null;

    #[ORM\Column(length: 4, nullable: true)]
    private ?string $paymentLast4 = null;

    #[ORM\Column(length: 7, nullable: true)]
    private ?string $paymentExpires = null;

    /** Square customer on the store merchant account (server-side only). */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $paymentCustomerId = null;

    /** Vaulted card id for repeat checkout (server-side only). */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $paymentCardId = null;

    /** card, apple_pay, or google_pay — how the saved method was tokenized. */
    #[ORM\Column(length: 32, nullable: true)]
    private ?string $paymentMethodType = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    /** @var Collection<int, CustomerFavorite> */
    #[ORM\OneToMany(mappedBy: 'customer', targetEntity: CustomerFavorite::class, orphanRemoval: true)]
    private Collection $favorites;

    /** @var Collection<int, CustomerWantListEntry> */
    #[ORM\OneToMany(mappedBy: 'customer', targetEntity: CustomerWantListEntry::class, orphanRemoval: true)]
    private Collection $wantListEntries;

    /** @var Collection<int, CartItem> */
    #[ORM\OneToMany(mappedBy: 'customer', targetEntity: CartItem::class, orphanRemoval: true)]
    private Collection $cartItems;

    public function __construct()
    {
        $now = new \DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = $now;
        $this->favorites = new ArrayCollection();
        $this->wantListEntries = new ArrayCollection();
        $this->cartItems = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUser(): ?User
    {
        return $this->user;
    }

    public function setUser(?User $user): static
    {
        $this->user = $user;

        return $this;
    }

    public function getStore(): ?Store
    {
        return $this->store;
    }

    public function setStore(?Store $store): static
    {
        $this->store = $store;

        return $this;
    }

    public function getPhone(): ?string
    {
        return $this->phone;
    }

    public function setPhone(?string $phone): static
    {
        $this->phone = $phone;
        $this->touch();

        return $this;
    }

    public function getShippingAddress(): ?string
    {
        return $this->shippingAddress;
    }

    public function setShippingAddress(?string $shippingAddress): static
    {
        $this->shippingAddress = $shippingAddress;
        $this->touch();

        return $this;
    }

    public function getPaymentBrand(): ?string
    {
        return $this->paymentBrand;
    }

    public function setPaymentBrand(?string $paymentBrand): static
    {
        $this->paymentBrand = $paymentBrand;
        $this->touch();

        return $this;
    }

    public function getPaymentLast4(): ?string
    {
        return $this->paymentLast4;
    }

    public function setPaymentLast4(?string $paymentLast4): static
    {
        $this->paymentLast4 = $paymentLast4;
        $this->touch();

        return $this;
    }

    public function getPaymentExpires(): ?string
    {
        return $this->paymentExpires;
    }

    public function setPaymentExpires(?string $paymentExpires): static
    {
        $this->paymentExpires = $paymentExpires;
        $this->touch();

        return $this;
    }

    public function getPaymentCustomerId(): ?string
    {
        return $this->paymentCustomerId;
    }

    public function setPaymentCustomerId(?string $paymentCustomerId): static
    {
        $this->paymentCustomerId = $paymentCustomerId;
        $this->touch();

        return $this;
    }

    public function getPaymentCardId(): ?string
    {
        return $this->paymentCardId;
    }

    public function setPaymentCardId(?string $paymentCardId): static
    {
        $this->paymentCardId = $paymentCardId;
        $this->touch();

        return $this;
    }

    public function getPaymentMethodType(): ?string
    {
        return $this->paymentMethodType;
    }

    public function setPaymentMethodType(?string $paymentMethodType): static
    {
        $this->paymentMethodType = $paymentMethodType;
        $this->touch();

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

    /** @return Collection<int, CustomerFavorite> */
    public function getFavorites(): Collection
    {
        return $this->favorites;
    }

    /** @return Collection<int, CustomerWantListEntry> */
    public function getWantListEntries(): Collection
    {
        return $this->wantListEntries;
    }

    /** @return Collection<int, CartItem> */
    public function getCartItems(): Collection
    {
        return $this->cartItems;
    }

    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }
}
