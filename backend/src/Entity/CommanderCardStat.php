<?php

namespace App\Entity;

use App\Repository\CommanderCardStatRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Precomputed aggregate for one card under one commander (and optionally one
 * strategy). This single indexed table answers recommendation Levels 1 and 2:
 *
 *   Level 1 — is this card good with this commander?  → commanderAffinity
 *   Level 2 — is it good for this strategy?           → strategyAffinity
 *
 * Level 3 (given the cards already in the deck) is computed per request from the
 * reference deck membership rows, because it depends on user state.
 *
 * Written by the background refresher only. Nothing on the request path writes
 * here, which is what keeps recommendations fast.
 */
#[ORM\Entity(repositoryClass: CommanderCardStatRepository::class)]
#[ORM\Table(name: 'commander_card_stats')]
#[ORM\UniqueConstraint(name: 'uniq_commander_card_stat', columns: ['commander_oracle_id', 'strategy_id', 'oracle_id'])]
#[ORM\Index(name: 'idx_commander_card_stat_lookup', columns: ['commander_oracle_id', 'strategy_id', 'base_score'])]
#[ORM\Index(name: 'idx_commander_card_stat_oracle', columns: ['oracle_id'])]
class CommanderCardStat
{
    /**
     * Sentinel strategy for the commander-wide aggregate. A real slug never
     * collides with it, and using a sentinel instead of NULL keeps the unique
     * index usable (Postgres treats NULLs as distinct).
     */
    public const STRATEGY_OVERALL = '_overall';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(name: 'commander_oracle_id', type: 'uuid')]
    private Uuid $commanderOracleId;

    #[ORM\Column(name: 'strategy_id', length: 64)]
    private string $strategyId;

    #[ORM\Column(name: 'oracle_id', type: 'uuid')]
    private Uuid $oracleId;

    /** Reference decks in this scope that play the card. */
    #[ORM\Column(name: 'deck_count')]
    private int $deckCount = 0;

    /** Reference decks in this scope, i.e. the denominator. */
    #[ORM\Column(name: 'sample_size')]
    private int $sampleSize = 0;

    #[ORM\Column(name: 'inclusion_rate')]
    private float $inclusionRate = 0.0;

    #[ORM\Column(name: 'commander_affinity')]
    private float $commanderAffinity = 0.0;

    #[ORM\Column(name: 'strategy_affinity')]
    private float $strategyAffinity = 0.0;

    #[ORM\Column(name: 'average_quantity')]
    private float $averageQuantity = 1.0;

    /** Strategy-agnostic pre-score, used to order candidate generation. */
    #[ORM\Column(name: 'base_score')]
    private float $baseScore = 0.0;

    #[ORM\Column]
    private float $confidence = 0.0;

    /** Most common provider role hint, e.g. "Ramp". Advisory only. */
    #[ORM\Column(name: 'role_hint', length: 64, nullable: true)]
    private ?string $roleHint = null;

    #[ORM\Column(name: 'updated_at')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Uuid $commanderOracleId, string $strategyId, Uuid $oracleId)
    {
        $this->commanderOracleId = $commanderOracleId;
        $this->strategyId = $strategyId;
        $this->oracleId = $oracleId;
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getCommanderOracleId(): Uuid { return $this->commanderOracleId; }

    public function getStrategyId(): string { return $this->strategyId; }

    public function getOracleId(): Uuid { return $this->oracleId; }

    public function getDeckCount(): int { return $this->deckCount; }
    public function setDeckCount(int $count): static { $this->deckCount = max(0, $count); return $this; }

    public function getSampleSize(): int { return $this->sampleSize; }
    public function setSampleSize(int $size): static { $this->sampleSize = max(0, $size); return $this; }

    public function getInclusionRate(): float { return $this->inclusionRate; }
    public function setInclusionRate(float $rate): static { $this->inclusionRate = $this->clamp($rate); return $this; }

    public function getCommanderAffinity(): float { return $this->commanderAffinity; }
    public function setCommanderAffinity(float $value): static { $this->commanderAffinity = $this->clamp($value); return $this; }

    public function getStrategyAffinity(): float { return $this->strategyAffinity; }
    public function setStrategyAffinity(float $value): static { $this->strategyAffinity = $this->clamp($value); return $this; }

    public function getAverageQuantity(): float { return $this->averageQuantity; }
    public function setAverageQuantity(float $value): static { $this->averageQuantity = max(0.0, $value); return $this; }

    public function getBaseScore(): float { return $this->baseScore; }
    public function setBaseScore(float $value): static { $this->baseScore = $this->clamp($value); return $this; }

    public function getConfidence(): float { return $this->confidence; }
    public function setConfidence(float $value): static { $this->confidence = $this->clamp($value); return $this; }

    public function getRoleHint(): ?string { return $this->roleHint; }
    public function setRoleHint(?string $hint): static { $this->roleHint = null === $hint ? null : mb_substr($hint, 0, 64); return $this; }

    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): static { $this->updatedAt = new \DateTimeImmutable(); return $this; }

    public function isOverall(): bool
    {
        return self::STRATEGY_OVERALL === $this->strategyId;
    }

    private function clamp(float $value): float
    {
        return max(0.0, min(1.0, $value));
    }
}
