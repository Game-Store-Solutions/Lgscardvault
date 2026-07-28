<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * One line in a saved deck. The card name is a snapshot so the line
 * survives even if the catalog printing it points at goes away.
 */
#[ORM\Entity]
#[ORM\Table(name: 'deck_cards')]
class DeckCard
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'cards')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Deck $deck = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Card $card = null;

    #[ORM\Column(length: 255)]
    private string $cardName = '';

    #[ORM\Column]
    private int $quantity = 1;

    public function getId(): ?int { return $this->id; }

    public function getDeck(): ?Deck { return $this->deck; }
    public function setDeck(?Deck $deck): static { $this->deck = $deck; return $this; }

    public function getCard(): ?Card { return $this->card; }
    public function setCard(?Card $card): static { $this->card = $card; return $this; }

    public function getCardName(): string { return $this->cardName; }
    public function setCardName(string $cardName): static { $this->cardName = $cardName; return $this; }

    public function getQuantity(): int { return $this->quantity; }
    public function setQuantity(int $quantity): static { $this->quantity = max(1, $quantity); return $this; }
}
