<?php

namespace App\Entity;

use App\Repository\CommanderStrategyStatRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * How much reference data we actually hold for one commander/strategy pair.
 *
 * This row is what lets recommendations be honest about confidence. A strategy
 * backed by nine decks and one backed by two must not present identically, and
 * the fallback ladder needs to know which rung it is standing on.
 *
 * `strategyId` is a StrategyTaxonomy slug. A null-strategy row is not used here;
 * the commander-overall aggregate is stored under the sentinel
 * CommanderCardStat::STRATEGY_OVERALL instead so the unique index stays simple.
 */
#[ORM\Entity(repositoryClass: CommanderStrategyStatRepository::class)]
#[ORM\Table(name: 'commander_strategy_stats')]
#[ORM\UniqueConstraint(name: 'uniq_commander_strategy', columns: ['commander_oracle_id', 'strategy_id'])]
#[ORM\Index(name: 'idx_commander_strategy_commander', columns: ['commander_oracle_id', 'deck_count'])]
class CommanderStrategyStat
{
    /** Provider tags gave us the label directly — the strongest signal. */
    public const SOURCE_PROVIDER = 'provider';
    /** Inferred from deck composition when the provider had no tags. */
    public const SOURCE_CLASSIFIER = 'classifier';
    /** Derived from the commander's own text via StrategyCatalog. */
    public const SOURCE_CATALOG = 'catalog';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(name: 'commander_oracle_id', type: 'uuid')]
    private Uuid $commanderOracleId;

    #[ORM\Column(name: 'strategy_id', length: 64)]
    private string $strategyId;

    /** Reference decks classified into this strategy. */
    #[ORM\Column(name: 'deck_count')]
    private int $deckCount = 0;

    /** Reference decks held for this commander overall, for share calculations. */
    #[ORM\Column(name: 'sample_size')]
    private int $sampleSize = 0;

    #[ORM\Column]
    private float $confidence = 0.0;

    #[ORM\Column(length: 32)]
    private string $source = self::SOURCE_CLASSIFIER;

    #[ORM\Column(name: 'updated_at')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Uuid $commanderOracleId, string $strategyId)
    {
        $this->commanderOracleId = $commanderOracleId;
        $this->strategyId = $strategyId;
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getCommanderOracleId(): Uuid { return $this->commanderOracleId; }

    public function getStrategyId(): string { return $this->strategyId; }

    public function getDeckCount(): int { return $this->deckCount; }
    public function setDeckCount(int $count): static { $this->deckCount = max(0, $count); return $this; }

    public function getSampleSize(): int { return $this->sampleSize; }
    public function setSampleSize(int $size): static { $this->sampleSize = max(0, $size); return $this; }

    public function getConfidence(): float { return $this->confidence; }
    public function setConfidence(float $confidence): static { $this->confidence = max(0.0, min(1.0, $confidence)); return $this; }

    public function getSource(): string { return $this->source; }
    public function setSource(string $source): static { $this->source = $source; return $this; }

    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): static { $this->updatedAt = new \DateTimeImmutable(); return $this; }

    /** Share of this commander's reference decks that play this strategy. */
    public function share(): float
    {
        return $this->sampleSize > 0 ? $this->deckCount / $this->sampleSize : 0.0;
    }
}
