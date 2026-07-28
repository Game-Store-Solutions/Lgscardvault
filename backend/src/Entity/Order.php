<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Link;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\Enum\OrderStatus;
use App\Repository\OrderRepository;
use App\State\StoreOrderCollectionProvider;
use App\State\StoreOrderItemProvider;
use App\State\StoreOrderProcessor;
use App\State\StoreOrderStatusProcessor;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: OrderRepository::class)]
#[ORM\Table(name: 'orders')]
#[ORM\Index(name: 'IDX_ORDER_STORE', fields: ['store'])]
#[ApiResource(
    operations: [
        new GetCollection(
            uriTemplate: '/stores/{slug}/orders',
            uriVariables: [
                'slug' => new Link(fromClass: Store::class, identifiers: ['slug']),
            ],
            normalizationContext: ['groups' => ['order:read']],
            security: "is_granted('STORE_MANAGE', request.attributes.get('store'))",
            provider: StoreOrderCollectionProvider::class,
        ),
        new Get(
            uriTemplate: '/stores/{slug}/orders/{id}',
            uriVariables: [
                'slug' => new Link(fromProperty: 'store', fromClass: Store::class, identifiers: ['slug']),
                'id' => new Link(fromClass: Order::class),
            ],
            normalizationContext: ['groups' => ['order:read']],
            security: "is_granted('STORE_MANAGE', object.getStore())",
            provider: StoreOrderItemProvider::class,
        ),
        new Patch(
            uriTemplate: '/stores/{slug}/orders/{id}',
            uriVariables: [
                'slug' => new Link(fromProperty: 'store', fromClass: Store::class, identifiers: ['slug']),
                'id' => new Link(fromClass: Order::class),
            ],
            normalizationContext: ['groups' => ['order:read']],
            denormalizationContext: ['groups' => ['order:write']],
            security: "is_granted('STORE_MANAGE', object.getStore())",
            provider: StoreOrderItemProvider::class,
            processor: StoreOrderStatusProcessor::class,
        ),
        new Post(
            uriTemplate: '/stores/{slug}/orders',
            uriVariables: [
                'slug' => new Link(fromClass: Store::class, identifiers: ['slug']),
            ],
            read: false,
            normalizationContext: ['groups' => ['order:read']],
            denormalizationContext: ['groups' => ['order:write']],
            security: "is_granted('STORE_MANAGE', request.attributes.get('store'))",
            processor: StoreOrderProcessor::class,
        ),
    ],
)]
class Order
{
    public const FULFILLMENT_PICKUP = 'pickup';
    public const FULFILLMENT_SHIPPING = 'shipping';
    public const FULFILLMENTS = [self::FULFILLMENT_PICKUP, self::FULFILLMENT_SHIPPING];

    public const CHANNEL_ONLINE = 'online';
    public const CHANNEL_KIOSK = 'kiosk';
    public const CHANNELS = [self::CHANNEL_ONLINE, self::CHANNEL_KIOSK];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['order:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private ?Store $store = null;

    #[ORM\Column(length: 32, unique: true)]
    #[Groups(['order:read'])]
    private string $reference = '';

    #[ORM\Column(enumType: OrderStatus::class)]
    #[Groups(['order:read', 'order:write', 'order:status'])]
    private OrderStatus $status = OrderStatus::PENDING;

    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['order:read', 'order:write'])]
    private ?string $customerName = null;

    #[ORM\Column(length: 255, nullable: true)]
    #[Assert\Email]
    #[Groups(['order:read', 'order:write'])]
    private ?string $customerEmail = null;

    /**
     * How the customer receives the order. In-store pickup is the default —
     * most LGS singles sales walk out the door — and shipping is the opt-in.
     */
    #[ORM\Column(length: 16, options: ['default' => self::FULFILLMENT_PICKUP])]
    #[Assert\Choice(choices: self::FULFILLMENTS)]
    #[Groups(['order:read', 'order:write'])]
    private string $fulfillment = self::FULFILLMENT_PICKUP;

    /**
     * Where the order originated: the online storefront (customer checkout)
     * or an in-store kiosk terminal operated by staff.
     */
    #[ORM\Column(length: 16, options: ['default' => self::CHANNEL_ONLINE])]
    #[Assert\Choice(choices: self::CHANNELS)]
    #[Groups(['order:read', 'order:write'])]
    private string $channel = self::CHANNEL_ONLINE;

    /**
     * Write-only kiosk convenience: a customer user id typed at the kiosk.
     * StoreOrderProcessor resolves it to the customer's name/email so kiosk
     * orders are attributed to the right account. Never persisted itself.
     */
    #[Groups(['order:write'])]
    private ?int $kioskUserId = null;

    #[ORM\Column]
    #[Groups(['order:read'])]
    private int $totalCents = 0;

    /** Store credit spent on this order, in cents (0 = none). Refunded on cancel/refund. */
    #[ORM\Column(options: ['default' => 0])]
    #[Groups(['order:read'])]
    private int $creditAppliedCents = 0;

    #[ORM\Column]
    #[Groups(['order:read'])]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, OrderLine> */
    #[ORM\OneToMany(mappedBy: 'parentOrder', targetEntity: OrderLine::class, cascade: ['persist'], orphanRemoval: true)]
    #[Groups(['order:read'])]
    private Collection $lines;

    /**
     * Write-only payload: [{cardId?, cardName?, quantity, priceCents}, ...].
     * Turned into OrderLine entities by StoreOrderProcessor.
     *
     * @var array<int, array<string, mixed>>
     */
    #[Groups(['order:write'])]
    private array $inputLines = [];

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->lines = new ArrayCollection();
    }

    /** Single source of truth for the human-facing order reference format. */
    public static function generateReference(): string
    {
        return 'ORD-'.strtoupper(bin2hex(random_bytes(4)));
    }

    public function getId(): ?int
    {
        return $this->id;
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

    public function getReference(): string
    {
        return $this->reference;
    }

    public function setReference(string $reference): static
    {
        $this->reference = $reference;

        return $this;
    }

    public function getStatus(): OrderStatus
    {
        return $this->status;
    }

    public function setStatus(OrderStatus $status): static
    {
        $this->status = $status;

        return $this;
    }

    public function getCustomerName(): ?string
    {
        return $this->customerName;
    }

    public function setCustomerName(?string $customerName): static
    {
        $this->customerName = $customerName;

        return $this;
    }

    public function getCustomerEmail(): ?string
    {
        return $this->customerEmail;
    }

    public function setCustomerEmail(?string $customerEmail): static
    {
        $this->customerEmail = $customerEmail;

        return $this;
    }

    public function getChannel(): string
    {
        return $this->channel;
    }

    public function setChannel(string $channel): static
    {
        $this->channel = $channel;

        return $this;
    }

    public function getKioskUserId(): ?int
    {
        return $this->kioskUserId;
    }

    public function setKioskUserId(?int $kioskUserId): static
    {
        $this->kioskUserId = $kioskUserId;

        return $this;
    }

    public function getFulfillment(): string
    {
        return $this->fulfillment;
    }

    public function setFulfillment(string $fulfillment): static
    {
        $this->fulfillment = $fulfillment;

        return $this;
    }

    public function getTotalCents(): int
    {
        return $this->totalCents;
    }

    public function getCreditAppliedCents(): int
    {
        return $this->creditAppliedCents;
    }

    public function setCreditAppliedCents(int $creditAppliedCents): static
    {
        $this->creditAppliedCents = max(0, $creditAppliedCents);

        return $this;
    }

    public function setTotalCents(int $totalCents): static
    {
        $this->totalCents = $totalCents;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /** @return Collection<int, OrderLine> */
    public function getLines(): Collection
    {
        return $this->lines;
    }

    public function addLine(OrderLine $line): static
    {
        if (!$this->lines->contains($line)) {
            $this->lines->add($line);
            $line->setParentOrder($this);
        }

        return $this;
    }

    public function removeLine(OrderLine $line): static
    {
        if ($this->lines->removeElement($line) && $line->getParentOrder() === $this) {
            $line->setParentOrder(null);
        }

        return $this;
    }

    /** @return array<int, array<string, mixed>> */
    public function getInputLines(): array
    {
        return $this->inputLines;
    }

    /** @param array<int, array<string, mixed>> $inputLines */
    public function setInputLines(array $inputLines): static
    {
        $this->inputLines = $inputLines;

        return $this;
    }
}
