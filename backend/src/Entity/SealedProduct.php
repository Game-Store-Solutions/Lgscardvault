<?php

namespace App\Entity;

use App\Repository\SealedProductRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * A sealed product (booster box, bundle, deck, case, …) in the catalog —
 * deliberately a separate entity from Card. Sourced from TCGCSV, which
 * preserves the TCGplayer product identity and daily market prices.
 */
#[ORM\Entity(repositoryClass: SealedProductRepository::class)]
#[ORM\Table(name: 'sealed_products')]
#[ORM\UniqueConstraint(name: 'uniq_sealed_tcgcsv_product', columns: ['tcgcsv_product_id'])]
#[ORM\Index(name: 'idx_sealed_game_name', columns: ['game_id', 'name'])]
#[ORM\Index(name: 'idx_sealed_set', columns: ['game_set_id'])]
class SealedProduct
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Game $game = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(name: 'game_set_id', nullable: true, onDelete: 'SET NULL')]
    private ?GameSet $gameSet = null;

    /** TCGCSV / TCGplayer product id. */
    #[ORM\Column(type: 'bigint')]
    private string $tcgcsvProductId = '0';

    #[ORM\Column(length: 255)]
    private string $name = '';

    #[ORM\Column(length: 1024, nullable: true)]
    private ?string $imageUrl = null;

    /** TCGplayer product page. */
    #[ORM\Column(length: 1024, nullable: true)]
    private ?string $url = null;

    /** Daily TCGplayer market price snapshot, in cents. */
    #[ORM\Column(nullable: true)]
    private ?int $marketPriceCents = null;

    #[ORM\Column(nullable: true)]
    private ?int $lowPriceCents = null;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getGame(): ?Game { return $this->game; }
    public function setGame(?Game $game): static { $this->game = $game; return $this; }

    public function getGameSet(): ?GameSet { return $this->gameSet; }
    public function setGameSet(?GameSet $gameSet): static { $this->gameSet = $gameSet; return $this; }

    public function getTcgcsvProductId(): int { return (int) $this->tcgcsvProductId; }
    public function setTcgcsvProductId(int $tcgcsvProductId): static { $this->tcgcsvProductId = (string) $tcgcsvProductId; return $this; }

    public function getName(): string { return $this->name; }
    public function setName(string $name): static { $this->name = $name; return $this; }

    public function getImageUrl(): ?string { return $this->imageUrl; }
    public function setImageUrl(?string $imageUrl): static { $this->imageUrl = $imageUrl; return $this; }

    public function getUrl(): ?string { return $this->url; }
    public function setUrl(?string $url): static { $this->url = $url; return $this; }

    public function getMarketPriceCents(): ?int { return $this->marketPriceCents; }
    public function setMarketPriceCents(?int $marketPriceCents): static { $this->marketPriceCents = $marketPriceCents; return $this; }

    public function getLowPriceCents(): ?int { return $this->lowPriceCents; }
    public function setLowPriceCents(?int $lowPriceCents): static { $this->lowPriceCents = $lowPriceCents; return $this; }

    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): static { $this->updatedAt = new \DateTimeImmutable(); return $this; }
}
