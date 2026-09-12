<?php

namespace App\Entity;

use App\Repository\CustomerSetAlertRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CustomerSetAlertRepository::class)]
#[ORM\Table(name: 'customer_set_alerts')]
#[ORM\UniqueConstraint(name: 'uniq_customer_set_alert_watch', columns: ['user_id', 'store_id', 'game', 'set_code'])]
#[ORM\Index(name: 'idx_customer_set_alert_store_set', columns: ['store_id', 'game', 'set_code'])]
class CustomerSetAlert
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $user = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    #[ORM\Column(length: 40)]
    private string $game = '';

    #[ORM\Column(length: 40)]
    private string $setCode = '';

    #[ORM\Column(length: 255)]
    private string $setName = '';

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

    public function getUser(): ?User
    {
        return $this->user;
    }

    public function setUser(?User $user): static
    {
        $this->user = $user;

        return $this;
    }

    public function getStore(): ?Store
    {
        return $this->store;
    }

    public function setStore(?Store $store): static
    {
        $this->store = $store;

        return $this;
    }

    public function getGame(): string
    {
        return $this->game;
    }

    public function setGame(string $game): static
    {
        $this->game = mb_strtolower(trim($game));

        return $this;
    }

    public function getSetCode(): string
    {
        return $this->setCode;
    }

    public function setSetCode(string $setCode): static
    {
        $this->setCode = mb_strtolower(trim($setCode));

        return $this;
    }

    public function getSetName(): string
    {
        return $this->setName;
    }

    public function setSetName(string $setName): static
    {
        $this->setName = mb_substr(trim($setName), 0, 255);

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
