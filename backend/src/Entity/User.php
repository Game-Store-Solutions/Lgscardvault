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
#[ORM\Index(name: 'idx_user_password_reset_token', fields: ['passwordResetToken'])]
#[ORM\Index(name: 'idx_user_email_verify_token', fields: ['emailVerifyToken'])]
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

    /** HMAC-SHA256 hex of a one-time reset token; never store the raw token. */
    #[ORM\Column(length: 64, nullable: true)]
    private ?string $passwordResetToken = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $passwordResetExpiresAt = null;

    /**
     * Existing accounts and SSO/staff-created users start verified.
     * Public email+password signup sets this false until the inbox is confirmed.
     */
    #[ORM\Column(options: ['default' => true])]
    #[Groups(['user:read', 'user:admin', 'user:admin_write'])]
    private bool $emailVerified = true;

    #[ORM\Column(length: 64, nullable: true)]
    private ?string $emailVerifyToken = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $emailVerifyExpiresAt = null;

    /** @var list<string> */
    #[ORM\Column]
    #[Assert\All([
        new Assert\Choice(choices: ['ROLE_USER', 'ROLE_STORE_OWNER', 'ROLE_SUPER_ADMIN']),
    ])]
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

    #[ORM\Column(length: 40, nullable: true)]
    private ?string $paymentBrand = null;

    #[ORM\Column(length: 4, nullable: true)]
    private ?string $paymentLast4 = null;

    #[ORM\Column(length: 7, nullable: true)]
    private ?string $paymentExpires = null;

    #[ORM\Column(length: 32, nullable: true)]
    private ?string $paymentMethodType = null;

    /** Platform Square customer for the shopper wallet (server-side only). */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $paymentCustomerId = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $paymentCardId = null;

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

    public function getPasswordResetToken(): ?string
    {
        return $this->passwordResetToken;
    }

    public function setPasswordResetToken(?string $passwordResetToken): static
    {
        $this->passwordResetToken = $passwordResetToken;

        return $this;
    }

    public function getPasswordResetExpiresAt(): ?\DateTimeImmutable
    {
        return $this->passwordResetExpiresAt;
    }

    public function setPasswordResetExpiresAt(?\DateTimeImmutable $passwordResetExpiresAt): static
    {
        $this->passwordResetExpiresAt = $passwordResetExpiresAt;

        return $this;
    }

    public function clearPasswordReset(): static
    {
        $this->passwordResetToken = null;
        $this->passwordResetExpiresAt = null;

        return $this;
    }

    public function isEmailVerified(): bool
    {
        return $this->emailVerified;
    }

    public function setEmailVerified(bool $emailVerified): static
    {
        $this->emailVerified = $emailVerified;

        return $this;
    }

    public function getEmailVerifyToken(): ?string
    {
        return $this->emailVerifyToken;
    }

    public function setEmailVerifyToken(?string $emailVerifyToken): static
    {
        $this->emailVerifyToken = $emailVerifyToken;

        return $this;
    }

    public function getEmailVerifyExpiresAt(): ?\DateTimeImmutable
    {
        return $this->emailVerifyExpiresAt;
    }

    public function setEmailVerifyExpiresAt(?\DateTimeImmutable $emailVerifyExpiresAt): static
    {
        $this->emailVerifyExpiresAt = $emailVerifyExpiresAt;

        return $this;
    }

    public function markEmailVerified(): static
    {
        $this->emailVerified = true;
        $this->emailVerifyToken = null;
        $this->emailVerifyExpiresAt = null;

        return $this;
    }

    #[Groups(['user:admin_write'])]
    public function setPlainPassword(?string $plainPassword): static
    {
        $this->plainPassword = $plainPassword;

        return $this;
    }

    #[Groups(['user:admin_write'])]
    #[Assert\Length(min: 8, max: 4096)]
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

    public function getPaymentBrand(): ?string
    {
        return $this->paymentBrand;
    }

    public function setPaymentBrand(?string $paymentBrand): static
    {
        $this->paymentBrand = $paymentBrand;

        return $this;
    }

    public function getPaymentLast4(): ?string
    {
        return $this->paymentLast4;
    }

    public function setPaymentLast4(?string $paymentLast4): static
    {
        $this->paymentLast4 = $paymentLast4;

        return $this;
    }

    public function getPaymentExpires(): ?string
    {
        return $this->paymentExpires;
    }

    public function setPaymentExpires(?string $paymentExpires): static
    {
        $this->paymentExpires = $paymentExpires;

        return $this;
    }

    public function getPaymentMethodType(): ?string
    {
        return $this->paymentMethodType;
    }

    public function setPaymentMethodType(?string $paymentMethodType): static
    {
        $this->paymentMethodType = $paymentMethodType;

        return $this;
    }

    public function getPaymentCustomerId(): ?string
    {
        return $this->paymentCustomerId;
    }

    public function setPaymentCustomerId(?string $paymentCustomerId): static
    {
        $this->paymentCustomerId = $paymentCustomerId;

        return $this;
    }

    public function getPaymentCardId(): ?string
    {
        return $this->paymentCardId;
    }

    public function setPaymentCardId(?string $paymentCardId): static
    {
        $this->paymentCardId = $paymentCardId;

        return $this;
    }
}
