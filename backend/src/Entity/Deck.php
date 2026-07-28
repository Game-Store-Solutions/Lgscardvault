<?php

namespace App\Entity;

use App\Repository\DeckRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

/**
 * A customer's saved deck. Decks belong to the user, not to any store —
 * the same list can be checked against any store's stock.
 */
#[ORM\Entity(repositoryClass: DeckRepository::class)]
#[ORM\Table(name: 'decks')]
#[ORM\Index(name: 'idx_deck_user_updated', columns: ['user_id', 'updated_at'])]
class Deck
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $user = null;

    #[ORM\Column(length: 120)]
    private string $name = '';

    #[ORM\Column(length: 40, nullable: true)]
    private ?string $format = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    /** @var Collection<int, DeckCard> */
    #[ORM\OneToMany(mappedBy: 'deck', targetEntity: DeckCard::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $cards;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
        $this->cards = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }

    public function getUser(): ?User { return $this->user; }
    public function setUser(?User $user): static { $this->user = $user; return $this; }

    public function getName(): string { return $this->name; }
    public function setName(string $name): static { $this->name = $name; return $this; }

    public function getFormat(): ?string { return $this->format; }
    public function setFormat(?string $format): static { $this->format = $format; return $this; }

    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $notes): static { $this->notes = $notes; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): static { $this->updatedAt = new \DateTimeImmutable(); return $this; }

    /** @return Collection<int, DeckCard> */
    public function getCards(): Collection { return $this->cards; }

    public function addCard(DeckCard $card): static
    {
        if (!$this->cards->contains($card)) {
            $this->cards->add($card);
            $card->setDeck($this);
        }

        return $this;
    }

    public function cardCount(): int
    {
        return array_sum(array_map(static fn (DeckCard $card) => $card->getQuantity(), $this->cards->toArray()));
    }
}
