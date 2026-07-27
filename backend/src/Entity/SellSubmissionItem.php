<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * One card line inside a sell submission. Card name and per-copy offer are
 * snapshots taken at submission time.
 */
#[ORM\Entity]
#[ORM\Table(name: 'sell_submission_items')]
class SellSubmissionItem
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'items')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?SellSubmission $submission = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Card $card = null;

    #[ORM\Column(length: 255)]
    private string $cardName = '';

    #[ORM\Column]
    private bool $isFoil = false;

    #[ORM\Column]
    private int $quantity = 1;

    /** Store's per-copy cash offer at submission time, in cents. */
    #[ORM\Column]
    private int $offerCentsEach = 0;

    public function getId(): ?int { return $this->id; }

    public function getSubmission(): ?SellSubmission { return $this->submission; }
    public function setSubmission(?SellSubmission $submission): static { $this->submission = $submission; return $this; }

    public function getCard(): ?Card { return $this->card; }
    public function setCard(?Card $card): static { $this->card = $card; return $this; }

    public function getCardName(): string { return $this->cardName; }
    public function setCardName(string $cardName): static { $this->cardName = $cardName; return $this; }

    public function isFoil(): bool { return $this->isFoil; }
    public function setIsFoil(bool $isFoil): static { $this->isFoil = $isFoil; return $this; }

    public function getQuantity(): int { return $this->quantity; }
    public function setQuantity(int $quantity): static { $this->quantity = max(1, $quantity); return $this; }

    public function getOfferCentsEach(): int { return $this->offerCentsEach; }
    public function setOfferCentsEach(int $offerCentsEach): static { $this->offerCentsEach = max(0, $offerCentsEach); return $this; }
}
