<?php

namespace App\Entity;

use App\Repository\PlatformDailySalesLedgerRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * Running total of shopper captures for a usage-plan store on one calendar day.
 * The nightly settler charges 10% of {@see $grossCents} after the day closes.
 */
#[ORM\Entity(repositoryClass: PlatformDailySalesLedgerRepository::class)]
#[ORM\Table(name: 'platform_daily_sales_ledgers')]
#[ORM\UniqueConstraint(name: 'UNIQ_PLATFORM_DAILY_SALES_STORE_DATE', fields: ['store', 'businessDate'])]
#[ORM\Index(name: 'IDX_PLATFORM_DAILY_SALES_SETTLED', fields: ['settledAt', 'businessDate'])]
class PlatformDailySalesLedger
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Store $store;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $businessDate;

    #[ORM\Column(options: ['default' => 0])]
    private int $grossCents = 0;

    #[ORM\Column(options: ['default' => 0])]
    private int $feeSettledCents = 0;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $settledAt = null;

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $settlementReference = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $settlementError = null;

    #[ORM\Column(options: ['default' => 0])]
    private int $settlementAttempts = 0;

    public function __construct(Store $store, \DateTimeImmutable $businessDate)
    {
        $this->store = $store;
        $this->businessDate = $businessDate;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getStore(): Store
    {
        return $this->store;
    }

    public function getBusinessDate(): \DateTimeImmutable
    {
        return $this->businessDate;
    }

    public function getGrossCents(): int
    {
        return $this->grossCents;
    }

    public function addGrossCents(int $amountCents): void
    {
        if ($amountCents > 0) {
            $this->grossCents += $amountCents;
        }
    }

    public function getFeeSettledCents(): int
    {
        return $this->feeSettledCents;
    }

    public function isSettled(): bool
    {
        return null !== $this->settledAt;
    }

    public function getSettledAt(): ?\DateTimeImmutable
    {
        return $this->settledAt;
    }

    public function getSettlementReference(): ?string
    {
        return $this->settlementReference;
    }

    public function getSettlementError(): ?string
    {
        return $this->settlementError;
    }

    public function getSettlementAttempts(): int
    {
        return $this->settlementAttempts;
    }

    public function markSettled(int $feeCents, ?string $reference, \DateTimeImmutable $at): void
    {
        $this->feeSettledCents = max(0, $feeCents);
        $this->settlementReference = $reference;
        $this->settlementError = null;
        $this->settledAt = $at;
    }

    public function markSettlementFailed(string $reason): void
    {
        ++$this->settlementAttempts;
        $this->settlementError = mb_substr($reason, 0, 500);
    }
}
