<?php

namespace App\Entity;

use App\Repository\CsvImportJobRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CsvImportJobRepository::class)]
#[ORM\Table(name: 'csv_import_jobs')]
class CsvImportJob
{
    public const STATUS_QUEUED = 'queued';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_FAILED = 'failed';
    public const STATUS_PAUSED = 'paused';
    public const STATUS_CANCELLED = 'cancelled';

    /** Singles: rows resolve against the card catalog into InventoryItems. */
    public const TYPE_CARDS = 'cards';
    /** Sealed: rows resolve against the sealed catalog into SealedInventoryItems. */
    public const TYPE_SEALED = 'sealed';

    /** @var list<string> */
    public const TYPES = [self::TYPE_CARDS, self::TYPE_SEALED];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private ?Store $store = null;

    /**
     * Which game this import targets. Null on jobs created before the
     * multi-game catalog — those were Magic singles imports.
     */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Game $game = null;

    #[ORM\Column(length: 16, options: ['default' => self::TYPE_CARDS])]
    private string $importType = self::TYPE_CARDS;

    #[ORM\Column(length: 255)]
    private string $originalFilename = '';

    #[ORM\Column(length: 255)]
    private string $storagePath = '';

    #[ORM\Column(length: 32)]
    private string $status = self::STATUS_QUEUED;

    #[ORM\Column]
    private int $totalRows = 0;

    #[ORM\Column]
    private int $processedRows = 0;

    #[ORM\Column]
    private int $importedRows = 0;

    #[ORM\Column]
    private int $failedRows = 0;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $errorMessage = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $startedAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $finishedAt = null;

    public function __construct()
    {
        $now = new \DateTimeImmutable();
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getStore(): ?Store
    {
        return $this->store;
    }

    public function setStore(Store $store): static
    {
        $this->store = $store;

        return $this;
    }

    public function getGame(): ?Game
    {
        return $this->game;
    }

    public function setGame(?Game $game): static
    {
        $this->game = $game;

        return $this;
    }

    /** Game code for serialization; legacy jobs without a game were Magic. */
    public function resolvedGameCode(): string
    {
        return $this->game?->getCode() ?? Game::CODE_MTG;
    }

    public function getImportType(): string
    {
        return $this->importType;
    }

    public function setImportType(string $importType): static
    {
        $this->importType = in_array($importType, self::TYPES, true) ? $importType : self::TYPE_CARDS;

        return $this;
    }

    public function isSealedImport(): bool
    {
        return self::TYPE_SEALED === $this->importType;
    }

    public function getOriginalFilename(): string
    {
        return $this->originalFilename;
    }

    public function setOriginalFilename(string $originalFilename): static
    {
        $this->originalFilename = $originalFilename;

        return $this;
    }

    public function getStoragePath(): string
    {
        return $this->storagePath;
    }

    public function setStoragePath(string $storagePath): static
    {
        $this->storagePath = $storagePath;

        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): static
    {
        $this->status = $status;
        $this->touch();

        return $this;
    }

    public function getTotalRows(): int
    {
        return $this->totalRows;
    }

    public function setTotalRows(int $totalRows): static
    {
        $this->totalRows = $totalRows;
        $this->touch();

        return $this;
    }

    public function getProcessedRows(): int
    {
        return $this->processedRows;
    }

    public function setProcessedRows(int $processedRows): static
    {
        $this->processedRows = $processedRows;
        $this->touch();

        return $this;
    }

    public function getImportedRows(): int
    {
        return $this->importedRows;
    }

    public function setImportedRows(int $importedRows): static
    {
        $this->importedRows = $importedRows;
        $this->touch();

        return $this;
    }

    public function getFailedRows(): int
    {
        return $this->failedRows;
    }

    public function setFailedRows(int $failedRows): static
    {
        $this->failedRows = $failedRows;
        $this->touch();

        return $this;
    }

    public function getErrorMessage(): ?string
    {
        return $this->errorMessage;
    }

    public function setErrorMessage(?string $errorMessage): static
    {
        $this->errorMessage = $errorMessage;
        $this->touch();

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function getStartedAt(): ?\DateTimeImmutable
    {
        return $this->startedAt;
    }

    public function setStartedAt(?\DateTimeImmutable $startedAt): static
    {
        $this->startedAt = $startedAt;
        $this->touch();

        return $this;
    }

    public function getFinishedAt(): ?\DateTimeImmutable
    {
        return $this->finishedAt;
    }

    public function setFinishedAt(?\DateTimeImmutable $finishedAt): static
    {
        $this->finishedAt = $finishedAt;
        $this->touch();

        return $this;
    }

    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }
}
