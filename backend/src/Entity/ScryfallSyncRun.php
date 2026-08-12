<?php

namespace App\Entity;

use App\Repository\ScryfallSyncRunRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * Audit record for one Scryfall bulk catalog sync. Powers the platform
 * admin Sync Jobs view alongside TCGCSV {@see CatalogSyncRun} rows.
 */
#[ORM\Entity(repositoryClass: ScryfallSyncRunRepository::class)]
#[ORM\Table(name: 'scryfall_sync_runs')]
#[ORM\Index(name: 'idx_scryfall_sync_started', columns: ['started_at'])]
class ScryfallSyncRun
{
    public const STATUS_QUEUED = 'queued';
    public const STATUS_RUNNING = 'running';
    public const STATUS_SUCCEEDED = 'succeeded';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** Scryfall bulk dataset key, e.g. oracle_cards / default_cards. */
    #[ORM\Column(length: 32)]
    private string $bulkType;

    #[ORM\Column(length: 16, options: ['default' => self::STATUS_QUEUED])]
    private string $status = self::STATUS_QUEUED;

    #[ORM\Column]
    private \DateTimeImmutable $startedAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $heartbeatAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $finishedAt = null;

    /** Counters: inserted, updated, total, processed. */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $summary = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $error = null;

    public function __construct(string $bulkType)
    {
        $this->bulkType = $bulkType;
        $this->startedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getBulkType(): string
    {
        return $this->bulkType;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): static
    {
        $this->status = $status;

        return $this;
    }

    public function getStartedAt(): \DateTimeImmutable
    {
        return $this->startedAt;
    }

    public function getHeartbeatAt(): ?\DateTimeImmutable
    {
        return $this->heartbeatAt;
    }

    public function beat(): static
    {
        $this->heartbeatAt = new \DateTimeImmutable();

        return $this;
    }

    public function getFinishedAt(): ?\DateTimeImmutable
    {
        return $this->finishedAt;
    }

    public function setFinishedAt(?\DateTimeImmutable $finishedAt): static
    {
        $this->finishedAt = $finishedAt;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getSummary(): ?array
    {
        return $this->summary;
    }

    /** @param array<string, mixed>|null $summary */
    public function setSummary(?array $summary): static
    {
        $this->summary = $summary;

        return $this;
    }

    public function getError(): ?string
    {
        return $this->error;
    }

    public function setError(?string $error): static
    {
        $this->error = $error;

        return $this;
    }
}
