<?php

namespace App\Entity;

use App\Repository\StoreStaffRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * A person the store owner added to this storefront. Admin staff may use
 * STORE_MANAGE; members belong to the store but cannot open the dashboard.
 */
#[ORM\Entity(repositoryClass: StoreStaffRepository::class)]
#[ORM\Table(name: 'store_staff')]
#[ORM\UniqueConstraint(name: 'uniq_store_staff_store_user', columns: ['store_id', 'user_id'])]
class StoreStaff
{
    public const ROLE_ADMIN = 'admin';
    public const ROLE_MEMBER = 'member';

    /** @var list<string> */
    public const ROLES = [self::ROLE_ADMIN, self::ROLE_MEMBER];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'staff')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $user = null;

    #[ORM\Column(length: 16)]
    private string $role = self::ROLE_ADMIN;

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

    public function getStore(): ?Store
    {
        return $this->store;
    }

    public function setStore(?Store $store): static
    {
        $this->store = $store;

        return $this;
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

    public function getRole(): string
    {
        return $this->role;
    }

    public function setRole(string $role): static
    {
        $this->role = $role;

        return $this;
    }

    public function isAdmin(): bool
    {
        return self::ROLE_ADMIN === $this->role;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
