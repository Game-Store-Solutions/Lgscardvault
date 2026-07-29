<?php

namespace App\Entity;

use App\Repository\CustomerWantListEntryRepository;
use App\Service\Catalog\FinishVocabulary;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CustomerWantListEntryRepository::class)]
#[ORM\Table(name: 'customer_want_list_entries')]
class CustomerWantListEntry
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'wantListEntries')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?StoreCustomer $customer = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, referencedColumnName: 'id', onDelete: 'SET NULL')]
    private ?Card $card = null;

    #[ORM\Column(length: 255)]
    private string $cardName = '';

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $setCode = null;

    /** Treatment the customer wants, in the game's words. */
    #[ORM\Column(length: FinishVocabulary::MAX_LENGTH, options: ['default' => FinishVocabulary::DEFAULT_PLAIN])]
    private string $finish = FinishVocabulary::DEFAULT_PLAIN;

    #[ORM\Column]
    private int $quantity = 1;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $notes = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getCustomer(): ?StoreCustomer
    {
        return $this->customer;
    }

    public function setCustomer(?StoreCustomer $customer): static
    {
        $this->customer = $customer;

        return $this;
    }

    public function getCard(): ?Card
    {
        return $this->card;
    }

    public function setCard(?Card $card): static
    {
        $this->card = $card;

        return $this;
    }

    public function getCardName(): string
    {
        return $this->cardName;
    }

    public function setCardName(string $cardName): static
    {
        $this->cardName = $cardName;

        return $this;
    }

    public function getSetCode(): ?string
    {
        return $this->setCode;
    }

    public function setSetCode(?string $setCode): static
    {
        $this->setCode = $setCode;

        return $this;
    }

    public function getFinish(): string
    {
        return $this->finish;
    }

    public function setFinish(string $finish): static
    {
        $canonical = FinishVocabulary::canonical($finish);
        $this->finish = '' !== $canonical ? $canonical : FinishVocabulary::DEFAULT_PLAIN;

        return $this;
    }

    public function isFoil(): bool
    {
        return FinishVocabulary::isFoil($this->finish);
    }

    public function getQuantity(): int
    {
        return $this->quantity;
    }

    public function setQuantity(int $quantity): static
    {
        $this->quantity = $quantity;

        return $this;
    }

    public function getNotes(): ?string
    {
        return $this->notes;
    }

    public function setNotes(?string $notes): static
    {
        $this->notes = $notes;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
