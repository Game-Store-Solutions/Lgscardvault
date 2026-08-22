<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ORM\Table(name: 'compliance_documents')]
class ComplianceDocument
{
    public const KIND_SELLER_PERMIT = 'seller_permit';
    public const KIND_CITY_LICENSE = 'city_license';
    public const KIND_SECONDHAND = 'secondhand';
    public const KINDS = [self::KIND_SELLER_PERMIT, self::KIND_CITY_LICENSE, self::KIND_SECONDHAND];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['store:admin', 'compliance:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $owner;

    #[ORM\ManyToOne(inversedBy: 'complianceDocuments')]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Store $store = null;

    #[ORM\Column(length: 32)]
    #[Groups(['store:admin', 'compliance:read'])]
    private string $kind;

    #[ORM\Column(length: 80, unique: true)]
    private string $storageKey;

    #[ORM\Column(length: 255)]
    #[Groups(['store:admin', 'compliance:read'])]
    private string $originalFilename;

    #[ORM\Column(length: 64)]
    #[Groups(['store:admin', 'compliance:read'])]
    private string $mime;

    #[ORM\Column]
    #[Groups(['store:admin', 'compliance:read'])]
    private \DateTimeImmutable $createdAt;

    public function __construct(User $owner, string $kind, string $storageKey, string $originalFilename, string $mime)
    {
        $this->owner = $owner;
        $this->kind = $kind;
        $this->storageKey = $storageKey;
        $this->originalFilename = $originalFilename;
        $this->mime = $mime;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getOwner(): User
    {
        return $this->owner;
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

    public function getKind(): string
    {
        return $this->kind;
    }

    public function getStorageKey(): string
    {
        return $this->storageKey;
    }

    public function getOriginalFilename(): string
    {
        return $this->originalFilename;
    }

    public function getMime(): string
    {
        return $this->mime;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /** @return array{id: int|null, kind: string, originalFilename: string, mime: string, createdAt: string} */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'originalFilename' => $this->originalFilename,
            'mime' => $this->mime,
            'createdAt' => $this->createdAt->format(DATE_ATOM),
        ];
    }
}
