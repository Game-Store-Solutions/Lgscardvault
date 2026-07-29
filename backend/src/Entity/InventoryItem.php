<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Link;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\Enum\CardCondition;
use App\Repository\InventoryItemRepository;
use App\Service\Catalog\FinishVocabulary;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: InventoryItemRepository::class)]
#[ORM\Table(name: 'inventory_items')]
#[ORM\UniqueConstraint(name: 'UNIQ_INVENTORY_STORE_CARD', fields: ['store', 'card', 'condition', 'finish'])]
#[ORM\Index(name: 'idx_inventory_store_id_id', columns: ['store_id', 'id'])]
#[ApiResource(
    operations: [
        new GetCollection(
            uriTemplate: '/stores/{slug}/inventory',
            uriVariables: [
                'slug' => new Link(fromClass: Store::class, identifiers: ['slug']),
            ],
            // The storefront list only needs enough to render tiles, filter, and
            // sort. Heavy detail-only fields (full image set, legalities, flavor
            // text, per-face data, scryfall link) are dropped here to keep the
            // whole-inventory payload small — the item endpoint below still
            // serves them in full for the card details page.
            normalizationContext: [
                'groups' => ['inventory:read'],
                'ignored_attributes' => ['legalities', 'flavorText', 'cardFaces', 'scryfallUri'],
            ],
            provider: \App\State\StoreInventoryCollectionProvider::class,
        ),
        new Get(
            uriTemplate: '/stores/{slug}/inventory/{id}',
            uriVariables: [
                'slug' => new Link(fromProperty: 'store', fromClass: Store::class, identifiers: ['slug']),
                'id' => new Link(fromClass: InventoryItem::class),
            ],
            normalizationContext: ['groups' => ['inventory:read']],
            provider: \App\State\StoreInventoryItemProvider::class,
        ),
        new Post(
            uriTemplate: '/stores/{slug}/inventory',
            uriVariables: [
                'slug' => new Link(fromClass: Store::class, identifiers: ['slug']),
            ],
            read: false,
            normalizationContext: ['groups' => ['inventory:read']],
            denormalizationContext: ['groups' => ['inventory:write']],
            security: "is_granted('STORE_MANAGE', request.attributes.get('store'))",
            processor: \App\State\StoreInventoryProcessor::class,
        ),
        new Patch(
            uriTemplate: '/stores/{slug}/inventory/{id}',
            uriVariables: [
                'slug' => new Link(fromProperty: 'store', fromClass: Store::class, identifiers: ['slug']),
                'id' => new Link(fromClass: InventoryItem::class),
            ],
            normalizationContext: ['groups' => ['inventory:read']],
            denormalizationContext: ['groups' => ['inventory:write']],
            security: "is_granted('STORE_MANAGE', object.getStore())",
            provider: \App\State\StoreInventoryItemProvider::class,
            processor: \App\State\StoreInventoryProcessor::class,
        ),
        new Delete(
            uriTemplate: '/stores/{slug}/inventory/{id}',
            uriVariables: [
                'slug' => new Link(fromProperty: 'store', fromClass: Store::class, identifiers: ['slug']),
                'id' => new Link(fromClass: InventoryItem::class),
            ],
            security: "is_granted('STORE_MANAGE', object.getStore())",
            provider: \App\State\StoreInventoryItemProvider::class,
        ),
    ],
)]
class InventoryItem
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['inventory:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'inventoryItems')]
    #[ORM\JoinColumn(nullable: false)]
    private ?Store $store = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, referencedColumnName: 'id')]
    #[Groups(['inventory:read'])]
    private ?Card $card = null;

    #[Groups(['inventory:write'])]
    private ?string $cardId = null;

    #[ORM\Column]
    #[Assert\PositiveOrZero]
    #[Groups(['inventory:read', 'inventory:write'])]
    private int $quantity = 0;

    #[ORM\Column]
    #[Assert\PositiveOrZero]
    #[Groups(['inventory:read', 'inventory:write'])]
    private int $priceCents = 0;

    /**
     * What the store paid per copy (COGS basis). Null = cost not tracked for
     * this listing; reports count those units at zero cost and surface the
     * coverage gap instead of guessing.
     */
    #[ORM\Column(nullable: true)]
    #[Assert\PositiveOrZero]
    #[Groups(['inventory:read', 'inventory:write'])]
    private ?int $acquisitionCostCents = null;

    #[ORM\Column(enumType: CardCondition::class)]
    #[Groups(['inventory:read', 'inventory:write'])]
    private CardCondition $condition = CardCondition::NM;

    /**
     * The treatment this listing is of, in the game's own words: "Nonfoil"
     * and "Foil" for Magic, "Normal" / "Holofoil" / "Reverse Holofoil" for
     * Pokemon, "Cold Foil" for Flesh and Blood. Part of the line's identity,
     * so a store can price Holofoil and Reverse Holofoil separately.
     */
    #[ORM\Column(length: FinishVocabulary::MAX_LENGTH, options: ['default' => FinishVocabulary::DEFAULT_PLAIN])]
    #[Groups(['inventory:read'])]
    private string $finish = FinishVocabulary::DEFAULT_PLAIN;

    /**
     * Write-side inputs. Both are resolved against the card by
     * StoreInventoryProcessor, which is the only place that knows which
     * treatments the printing actually has. `foilHint` is the legacy
     * boolean, still accepted so older clients and the CSV importer keep
     * working.
     */
    private ?string $requestedFinish = null;
    private ?bool $foilHint = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['inventory:read', 'inventory:write'])]
    private ?string $notes = null;

    /**
     * Optimistic-locking version. Quantity updates are read-modify-write
     * (see StoreInventoryWriter); without this, two concurrent writers both
     * computing `current + n` silently lose one increment. With it, the
     * stale flush throws OptimisticLockException — the import worker
     * requeues and retries the batch, web callers surface a retryable
     * conflict instead of corrupting stock counts.
     */
    #[ORM\Version]
    #[ORM\Column(type: 'integer', options: ['default' => 1])]
    private int $version = 1;

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

    public function getCard(): ?Card
    {
        return $this->card;
    }

    public function setCard(?Card $card): static
    {
        $this->card = $card;

        return $this;
    }

    public function getCardId(): ?string
    {
        return $this->cardId;
    }

    public function setCardId(?string $cardId): static
    {
        $this->cardId = $cardId;

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

    public function getCondition(): CardCondition
    {
        return $this->condition;
    }

    public function setCondition(CardCondition $condition): static
    {
        $this->condition = $condition;

        return $this;
    }

    public function getFinish(): string
    {
        return $this->finish;
    }

    /**
     * Serializer entry point for the `finish` attribute on writes. The value
     * is only a request: it is matched against the printing's own treatments
     * before it becomes the stored finish.
     */
    #[Groups(['inventory:write'])]
    public function setFinish(?string $finish): static
    {
        $this->requestedFinish = $finish;

        return $this;
    }

    /** Sets the resolved treatment. Callers go through FinishVocabulary. */
    public function applyFinish(string $finish): static
    {
        $canonical = FinishVocabulary::canonical($finish);
        $this->finish = '' !== $canonical ? $canonical : FinishVocabulary::DEFAULT_PLAIN;

        return $this;
    }

    public function getRequestedFinish(): ?string
    {
        return $this->requestedFinish;
    }

    public function getFoilHint(): ?bool
    {
        return $this->foilHint;
    }

    /** Did the request say anything about the finish at all? */
    public function hasFinishInput(): bool
    {
        return null !== $this->requestedFinish || null !== $this->foilHint;
    }

    /**
     * Which side of the foil axis this treatment sits on. Prices, the card
     * shimmer, and buylist matching are all still binary.
     */
    public function isFoil(): bool
    {
        return FinishVocabulary::isFoil($this->finish);
    }

    /**
     * Explicit getter bound to the `isFoil` attribute. Without this the serializer
     * maps isFoil()/setIsFoil() to an attribute named `foil` (the `is` prefix is
     * stripped), leaving the `isFoil` group attribute with no readable getter — so
     * it was silently omitted from every response.
     */
    #[Groups(['inventory:read'])]
    public function getIsFoil(): bool
    {
        return $this->isFoil();
    }

    /**
     * Legacy write path: a client that only knows foil / not foil. This
     * records a REQUEST, not the stored finish — resolving it needs the card,
     * which only the processor has. Application code sets the treatment with
     * applyFinish().
     */
    #[Groups(['inventory:write'])]
    public function setIsFoil(bool $isFoil): static
    {
        $this->foilHint = $isFoil;

        return $this;
    }

    public function getVersion(): int
    {
        return $this->version;
    }

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function setNotes(?string $notes): static
    {
        $this->notes = $notes;

        return $this;
    }
}
