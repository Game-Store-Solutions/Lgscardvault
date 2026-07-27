<?php

namespace App\Entity;

use App\Repository\StoreSectionRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

/**
 * A "case card" section on a store's public Case Cards page: a named, ordered
 * group of the store's inventory listings.
 *
 * A section is filled one of two ways (see MODE_*):
 *  - manual: the owner searches their inventory and hand-picks listings;
 *  - auto:   the owner sets a price range + rarity and clicks "Pull from
 *            inventory", which materialises matching listings into the section
 *            (editable afterwards; re-pullable to refresh).
 *
 * Either way the section ends up as a concrete, ordered list of
 * StoreSectionCard rows, so rendering the public page is a simple read.
 */
#[ORM\Entity(repositoryClass: StoreSectionRepository::class)]
#[ORM\Table(name: 'store_sections')]
#[ORM\Index(columns: ['store_id', 'position'], name: 'idx_store_sections_store_position')]
class StoreSection
{
    public const MODE_MANUAL = 'manual';
    public const MODE_AUTO = 'auto';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    /**
     * The physical display case this section belongs to. Kept alongside the
     * direct store FK (redundant but convenient for store-scoped queries);
     * the controller guarantees section.store === case.store.
     */
    #[ORM\ManyToOne(inversedBy: 'sections')]
    #[ORM\JoinColumn(name: 'case_id', nullable: false, onDelete: 'CASCADE')]
    private ?StoreCase $storeCase = null;

    #[ORM\Column(length: 120)]
    private string $title = '';

    #[ORM\Column]
    private int $position = 0;

    #[ORM\Column(length: 16)]
    private string $mode = self::MODE_MANUAL;

    #[ORM\Column(nullable: true)]
    private ?int $autoMinPriceCents = null;

    #[ORM\Column(nullable: true)]
    private ?int $autoMaxPriceCents = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $autoRarity = null;

    /**
     * Canonical color-identity code produced by ColorIdentityParser: a sorted
     * WUBRG subset ("B", "WU", "WUBRG"), or one of the specials 'C' (colorless),
     * 'M' (any multicolor), '4C' (any four colors). Null = no color filter.
     */
    #[ORM\Column(length: 8, nullable: true)]
    private ?string $autoColorIdentity = null;

    #[ORM\Column(length: 16, nullable: true)]
    private ?string $autoSetCode = null;

    /** Matched case-insensitively against the card's type line ("Creature", "Instant", …). */
    #[ORM\Column(length: 40, nullable: true)]
    private ?string $autoCardType = null;

    /**
     * Maximum distinct cards this section holds — the physical capacity of
     * its area in the case. Caps auto-fill pulls and manual adds. Null = the
     * platform default (StoreSectionController::AUTO_FILL_MAX).
     */
    #[ORM\Column(nullable: true)]
    private ?int $cardLimit = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, StoreSectionCard> */
    #[ORM\OneToMany(mappedBy: 'section', targetEntity: StoreSectionCard::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    #[ORM\OrderBy(['position' => 'ASC', 'id' => 'ASC'])]
    private Collection $cards;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->cards = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }

    public function getStore(): ?Store { return $this->store; }
    public function setStore(?Store $store): static { $this->store = $store; return $this; }

    public function getStoreCase(): ?StoreCase { return $this->storeCase; }
    public function setStoreCase(?StoreCase $storeCase): static { $this->storeCase = $storeCase; return $this; }

    public function getTitle(): string { return $this->title; }
    public function setTitle(string $title): static { $this->title = $title; return $this; }

    public function getPosition(): int { return $this->position; }
    public function setPosition(int $position): static { $this->position = $position; return $this; }

    public function getMode(): string { return $this->mode; }
    public function setMode(string $mode): static { $this->mode = $mode; return $this; }

    public function getAutoMinPriceCents(): ?int { return $this->autoMinPriceCents; }
    public function setAutoMinPriceCents(?int $cents): static { $this->autoMinPriceCents = $cents; return $this; }

    public function getAutoMaxPriceCents(): ?int { return $this->autoMaxPriceCents; }
    public function setAutoMaxPriceCents(?int $cents): static { $this->autoMaxPriceCents = $cents; return $this; }

    public function getAutoRarity(): ?string { return $this->autoRarity; }
    public function setAutoRarity(?string $rarity): static { $this->autoRarity = $rarity; return $this; }

    public function getAutoColorIdentity(): ?string { return $this->autoColorIdentity; }
    public function setAutoColorIdentity(?string $code): static { $this->autoColorIdentity = $code; return $this; }

    public function getAutoSetCode(): ?string { return $this->autoSetCode; }
    public function setAutoSetCode(?string $setCode): static { $this->autoSetCode = $setCode; return $this; }

    public function getAutoCardType(): ?string { return $this->autoCardType; }
    public function setAutoCardType(?string $cardType): static { $this->autoCardType = $cardType; return $this; }

    public function getCardLimit(): ?int { return $this->cardLimit; }
    public function setCardLimit(?int $cardLimit): static { $this->cardLimit = $cardLimit; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    /** @return Collection<int, StoreSectionCard> */
    public function getCards(): Collection { return $this->cards; }

    public function addCard(StoreSectionCard $card): static
    {
        if (!$this->cards->contains($card)) {
            $this->cards->add($card);
            $card->setSection($this);
        }

        return $this;
    }

    public function removeCard(StoreSectionCard $card): static
    {
        $this->cards->removeElement($card);

        return $this;
    }

    public function clearCards(): void
    {
        $this->cards->clear();
    }
}
