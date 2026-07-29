<?php

namespace App\Entity;

use App\Enum\CardCondition;
use App\Service\Catalog\FinishVocabulary;
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

    /** Treatment the store is buying, in the game's words. */
    #[ORM\Column(length: FinishVocabulary::MAX_LENGTH, options: ['default' => FinishVocabulary::DEFAULT_PLAIN])]
    private string $finish = FinishVocabulary::DEFAULT_PLAIN;

    #[ORM\Column]
    private int $quantity = 1;

    /** Store's per-copy payout offer at submission time, in cents. */
    #[ORM\Column]
    private int $offerCentsEach = 0;

    /** Per-copy market price snapshot at submission time, in cents. */
    #[ORM\Column(options: ['default' => 0])]
    private int $marketPriceCents = 0;

    /** Customer-declared condition; verified by staff at the counter. */
    #[ORM\Column(enumType: CardCondition::class, options: ['default' => 'NM'])]
    private CardCondition $condition = CardCondition::NM;

    /** True when the line came from the store's buy list (premium rate or fixed offer). */
    #[ORM\Column(options: ['default' => false])]
    private bool $isFromBuylist = false;

    /** Copies staff agreed to buy during review; null until the submission is finalized. */
    #[ORM\Column(nullable: true)]
    private ?int $acceptedQuantity = null;

    public function getId(): ?int { return $this->id; }

    public function getSubmission(): ?SellSubmission { return $this->submission; }
    public function setSubmission(?SellSubmission $submission): static { $this->submission = $submission; return $this; }

    public function getCard(): ?Card { return $this->card; }
    public function setCard(?Card $card): static { $this->card = $card; return $this; }

    public function getCardName(): string { return $this->cardName; }
    public function setCardName(string $cardName): static { $this->cardName = $cardName; return $this; }

    public function getFinish(): string { return $this->finish; }
    public function setFinish(string $finish): static { $this->finish = FinishVocabulary::canonical($finish) ?: FinishVocabulary::DEFAULT_PLAIN; return $this; }
    public function isFoil(): bool { return FinishVocabulary::isFoil($this->finish); }

    public function getQuantity(): int { return $this->quantity; }
    public function setQuantity(int $quantity): static { $this->quantity = max(1, $quantity); return $this; }

    public function getOfferCentsEach(): int { return $this->offerCentsEach; }
    public function setOfferCentsEach(int $offerCentsEach): static { $this->offerCentsEach = max(0, $offerCentsEach); return $this; }

    public function getMarketPriceCents(): int { return $this->marketPriceCents; }
    public function setMarketPriceCents(int $marketPriceCents): static { $this->marketPriceCents = max(0, $marketPriceCents); return $this; }

    public function getCondition(): CardCondition { return $this->condition; }
    public function setCondition(CardCondition $condition): static { $this->condition = $condition; return $this; }

    public function isFromBuylist(): bool { return $this->isFromBuylist; }
    public function setIsFromBuylist(bool $isFromBuylist): static { $this->isFromBuylist = $isFromBuylist; return $this; }

    public function getAcceptedQuantity(): ?int { return $this->acceptedQuantity; }
    public function setAcceptedQuantity(?int $acceptedQuantity): static { $this->acceptedQuantity = $acceptedQuantity; return $this; }
}
