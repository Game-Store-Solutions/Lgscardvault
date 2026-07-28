<?php

namespace App\Entity;

use App\Repository\CatalogSyncRunRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * Audit record for one catalog synchronization (per game). Powers the
 * platform admin "Sync Jobs" view: what ran, when, and what it changed.
 */
#[ORM\Entity(repositoryClass: CatalogSyncRunRepository::class)]
#[ORM\Table(name: 'catalog_sync_runs')]
#[ORM\Index(name: 'idx_catalog_sync_started', columns: ['started_at'])]
class CatalogSyncRun
{
    public const STATUS_RUNNING = 'running';
    public const STATUS_SUCCEEDED = 'succeeded';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Game $game = null;

    #[ORM\Column(length: 16, options: ['default' => self::STATUS_RUNNING])]
    private string $status = self::STATUS_RUNNING;

    #[ORM\Column]
    private \DateTimeImmutable $startedAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $finishedAt = null;

    /** Counters: setsUpserted, cardsUpserted, sealedUpserted, groupsSeen, … */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $summary = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $error = null;

    public function __construct()
    {
        $this->startedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getGame(): ?Game { return $this->game; }
    public function setGame(?Game $game): static { $this->game = $game; return $this; }

    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): static { $this->status = $status; return $this; }

    public function getStartedAt(): \DateTimeImmutable { return $this->startedAt; }

    public function getFinishedAt(): ?\DateTimeImmutable { return $this->finishedAt; }
    public function setFinishedAt(?\DateTimeImmutable $finishedAt): static { $this->finishedAt = $finishedAt; return $this; }

    /** @return array<string, mixed>|null */
    public function getSummary(): ?array { return $this->summary; }

    /** @param array<string, mixed>|null $summary */
    public function setSummary(?array $summary): static { $this->summary = $summary; return $this; }

    public function getError(): ?string { return $this->error; }
    public function setError(?string $error): static { $this->error = $error; return $this; }
}
