<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\Repository\UserRepository;
use App\State\UserAdminProcessor;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'users')]
#[ORM\UniqueConstraint(name: 'UNIQ_USER_EMAIL', fields: ['email'])]
#[ApiResource(
    operations: [
        new GetCollection(
            uriTemplate: '/admin/users',
            security: "is_granted('ROLE_SUPER_ADMIN')",
            normalizationContext: ['groups' => ['user:read', 'user:admin']],
        ),
        new Post(
            uriTemplate: '/admin/users',
            security: "is_granted('ROLE_SUPER_ADMIN')",
            normalizationContext: ['groups' => ['user:read', 'user:admin']],
            denormalizationContext: ['groups' => ['user:admin_write']],
            processor: UserAdminProcessor::class,
        ),
        new Patch(
            uriTemplate: '/admin/users/{id}',
            security: "is_granted('ROLE_SUPER_ADMIN')",
            normalizationContext: ['groups' => ['user:read', 'user:admin']],
            denormalizationContext: ['groups' => ['user:admin_write']],
            processor: UserAdminProcessor::class,
        ),
        new Get(
            uriTemplate: '/admin/users/{id}',
            security: "is_granted('ROLE_SUPER_ADMIN')",
            normalizationContext: ['groups' => ['user:read', 'user:admin']],
        ),
    ],
)]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['user:read', 'user:admin', 'store:read'])]
    private ?int $id = null;

    #[ORM\Column(length: 180)]
    #[Assert\NotBlank]
    #[Assert\Email]
    #[Groups(['user:read', 'user:admin', 'user:admin_write', 'store:read'])]
    private ?string $email = null;

    #[ORM\Column]
    private ?string $password = null;

    /** @var list<string> */
    #[ORM\Column]
    #[Groups(['user:read', 'user:admin', 'user:admin_write'])]
    private array $roles = [];

    #[ORM\Column(length: 255)]
    #[Assert\NotBlank]
    #[Groups(['user:read', 'user:admin', 'user:admin_write', 'store:read'])]
    private ?string $displayName = null;

    /** Hosted profile-image URL (https:// or a /path); null = initials avatar. */
    #[ORM\Column(length: 1024, nullable: true)]
    #[Groups(['user:read', 'user:admin'])]
    private ?string $avatarUrl = null;

    /** @var Collection<int, Store> */
    #[ORM\OneToMany(mappedBy: 'owner', targetEntity: Store::class)]
    private Collection $ownedStores;

    public function __construct()
    {
        $this->ownedStores = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmail(): ?string
    {
        return $this->email;
    }

    public function setEmail(string $email): static
    {
        $this->email = $email;

        return $this;
    }

    public function getUserIdentifier(): string
    {
        return (string) $this->email;
    }

    /** @return list<string> */
    public function getRoles(): array
    {
        $roles = $this->roles;
        $roles[] = 'ROLE_USER';

        return array_values(array_unique($roles));
    }

    /** @param list<string> $roles */
    public function setRoles(array $roles): static
    {
        $this->roles = $roles;

        return $this;
    }

    public function getPassword(): ?string
    {
        return $this->password;
    }

    public function setPassword(string $password): static
    {
        $this->password = $password;

        return $this;
    }

    #[Groups(['user:admin_write'])]
    public function setPlainPassword(?string $plainPassword): static
    {
        $this->plainPassword = $plainPassword;

        return $this;
    }

    #[Groups(['user:admin_write'])]
    private ?string $plainPassword = null;

    public function getPlainPassword(): ?string
    {
        return $this->plainPassword;
    }

    public function eraseCredentials(): void
    {
        $this->plainPassword = null;
    }

    public function getDisplayName(): ?string
    {
        return $this->displayName;
    }

    public function getAvatarUrl(): ?string
    {
        return $this->avatarUrl;
    }

    public function setAvatarUrl(?string $avatarUrl): static
    {
        $this->avatarUrl = $avatarUrl;

        return $this;
    }

    public function setDisplayName(string $displayName): static
    {
        $this->displayName = $displayName;

        return $this;
    }

    /** @return Collection<int, Store> */
    public function getOwnedStores(): Collection
    {
        return $this->ownedStores;
    }

    public function addOwnedStore(Store $store): static
    {
        if (!$this->ownedStores->contains($store)) {
            $this->ownedStores->add($store);
            $store->setOwner($this);
        }

        return $this;
    }
}
