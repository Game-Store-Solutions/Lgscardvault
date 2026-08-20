<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * One mainboard entry of a reference deck, identified by oracle id.
 *
 * Intentionally narrow — this table is the hot path for co-occurrence, so it
 * stores the identity, the quantity, and a coarse provider role hint, and
 * nothing that could be looked up from `cards`.
 *
 * No foreign key to `cards`: reference decks routinely contain printings we have
 * never imported, and losing the row would silently distort inclusion rates.
 * The oracle id is resolved against our catalog at read time instead.
 */
#[ORM\Entity]
#[ORM\Table(name: 'reference_deck_cards')]
#[ORM\UniqueConstraint(name: 'uniq_reference_deck_card', columns: ['reference_deck_id', 'oracle_id'])]
#[ORM\Index(name: 'idx_reference_deck_card_oracle', columns: ['oracle_id'])]
class ReferenceDeckCard
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: ReferenceDeck::class, inversedBy: 'cards')]
    #[ORM\JoinColumn(name: 'reference_deck_id', nullable: false, onDelete: 'CASCADE')]
    private ReferenceDeck $referenceDeck;

    #[ORM\Column(name: 'oracle_id', type: 'uuid')]
    private Uuid $oracleId;

    #[ORM\Column(type: 'smallint')]
    private int $quantity = 1;

    #[ORM\Column(name: 'role_hint', length: 64, nullable: true)]
    private ?string $roleHint = null;

    public function __construct(ReferenceDeck $deck, Uuid $oracleId, int $quantity = 1, ?string $roleHint = null)
    {
        $this->referenceDeck = $deck;
        $this->oracleId = $oracleId;
        $this->quantity = max(1, $quantity);
        $this->roleHint = null === $roleHint ? null : mb_substr($roleHint, 0, 64);
        $deck->addCard($this);
    }

    public function getId(): ?int { return $this->id; }

    public function getReferenceDeck(): ReferenceDeck { return $this->referenceDeck; }

    public function getOracleId(): Uuid { return $this->oracleId; }

    public function getQuantity(): int { return $this->quantity; }
    public function setQuantity(int $quantity): static { $this->quantity = max(1, $quantity); return $this; }

    public function getRoleHint(): ?string { return $this->roleHint; }
}
