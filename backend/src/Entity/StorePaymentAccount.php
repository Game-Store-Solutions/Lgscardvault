<?php

namespace App\Entity;

use App\Repository\StorePaymentAccountRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: StorePaymentAccountRepository::class)]
#[ORM\Table(name: 'store_payment_accounts')]
#[ORM\UniqueConstraint(name: 'UNIQ_STORE_PAYMENT_PROVIDER', fields: ['store', 'provider'])]
class StorePaymentAccount
{
    public const PROVIDER_SQUARE = 'square';
    public const PROVIDER_PAYPAL = 'paypal';
    public const STATUS_CONNECTED = 'connected';
    public const STATUS_DISCONNECTED = 'disconnected';
    public const STATUS_ERROR = 'error';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Store $store = null;

    #[ORM\Column(length: 32)]
    private string $provider = self::PROVIDER_SQUARE;

    #[ORM\Column(length: 32)]
    private string $status = self::STATUS_DISCONNECTED;

    #[ORM\Column(length: 32)]
    private string $environment = 'sandbox';

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $providerMerchantId = null;

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $providerLocationId = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $accessTokenEncrypted = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $refreshTokenEncrypted = null;

    /** @var list<string> */
    #[ORM\Column(type: 'json')]
    private array $scopes = [];

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $tokenExpiresAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $connectedAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $disconnectedAt = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $lastError = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

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

    public function setStore(?Store $store): static
    {
        $this->store = $store;
        $this->touch();

        return $this;
    }

    public function getProvider(): string
    {
        return $this->provider;
    }

    public function setProvider(string $provider): static
    {
        $this->provider = $provider;
        $this->touch();

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

    public function getEnvironment(): string
    {
        return $this->environment;
    }

    public function setEnvironment(string $environment): static
    {
        $this->environment = $environment;
        $this->touch();

        return $this;
    }

    public function getProviderMerchantId(): ?string
    {
        return $this->providerMerchantId;
    }

    public function setProviderMerchantId(?string $providerMerchantId): static
    {
        $this->providerMerchantId = $providerMerchantId;
        $this->touch();

        return $this;
    }

    public function getProviderLocationId(): ?string
    {
        return $this->providerLocationId;
    }

    public function setProviderLocationId(?string $providerLocationId): static
    {
        $this->providerLocationId = $providerLocationId;
        $this->touch();

        return $this;
    }

    public function getAccessTokenEncrypted(): ?string
    {
        return $this->accessTokenEncrypted;
    }

    public function setAccessTokenEncrypted(?string $accessTokenEncrypted): static
    {
        $this->accessTokenEncrypted = $accessTokenEncrypted;
        $this->touch();

        return $this;
    }

    public function getRefreshTokenEncrypted(): ?string
    {
        return $this->refreshTokenEncrypted;
    }

    public function setRefreshTokenEncrypted(?string $refreshTokenEncrypted): static
    {
        $this->refreshTokenEncrypted = $refreshTokenEncrypted;
        $this->touch();

        return $this;
    }

    /** @return list<string> */
    public function getScopes(): array
    {
        return $this->scopes;
    }

    /** @param list<string> $scopes */
    public function setScopes(array $scopes): static
    {
        $this->scopes = array_values($scopes);
        $this->touch();

        return $this;
    }

    public function getTokenExpiresAt(): ?\DateTimeImmutable
    {
        return $this->tokenExpiresAt;
    }

    public function setTokenExpiresAt(?\DateTimeImmutable $tokenExpiresAt): static
    {
        $this->tokenExpiresAt = $tokenExpiresAt;
        $this->touch();

        return $this;
    }

    public function getConnectedAt(): ?\DateTimeImmutable
    {
        return $this->connectedAt;
    }

    public function markConnected(): static
    {
        $this->status = self::STATUS_CONNECTED;
        $this->connectedAt = new \DateTimeImmutable();
        $this->disconnectedAt = null;
        $this->lastError = null;
        $this->touch();

        return $this;
    }

    public function getDisconnectedAt(): ?\DateTimeImmutable
    {
        return $this->disconnectedAt;
    }

    public function markDisconnected(): static
    {
        $this->status = self::STATUS_DISCONNECTED;
        $this->disconnectedAt = new \DateTimeImmutable();
        $this->accessTokenEncrypted = null;
        $this->refreshTokenEncrypted = null;
        $this->tokenExpiresAt = null;
        $this->touch();

        return $this;
    }

    public function getLastError(): ?string
    {
        return $this->lastError;
    }

    public function setLastError(?string $lastError): static
    {
        $this->lastError = $lastError;
        $this->status = null === $lastError ? $this->status : self::STATUS_ERROR;
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

    private function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }
}
