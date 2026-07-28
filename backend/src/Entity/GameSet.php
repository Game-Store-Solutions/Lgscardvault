<?php

namespace App\Entity;

use App\Repository\GameSetRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * One expansion/set within a game, mirrored from a TCGCSV "group". Cards
 * and sealed products reference their set; MTG singles keep Scryfall as
 * their source of truth, so their set linkage stays on Card::$setCode
 * while TCGCSV-sourced sets primarily serve sealed products and the
 * non-MTG card catalogs.
 */
#[ORM\Entity(repositoryClass: GameSetRepository::class)]
#[ORM\Table(name: 'game_sets')]
#[ORM\UniqueConstraint(name: 'uniq_game_set_tcgcsv_group', columns: ['tcgcsv_group_id'])]
#[ORM\Index(name: 'idx_game_set_game', columns: ['game_id', 'release_date'])]
class GameSet
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Game $game = null;

    /** TCGCSV / TCGplayer group id. */
    #[ORM\Column]
    private int $tcgcsvGroupId = 0;

    #[ORM\Column(length: 255)]
    private string $name = '';

    /** Set abbreviation ("MH3", "OP01") when TCGCSV provides one. */
    #[ORM\Column(length: 40, nullable: true)]
    private ?string $code = null;

    #[ORM\Column(type: 'date_immutable', nullable: true)]
    private ?\DateTimeImmutable $releaseDate = null;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getGame(): ?Game { return $this->game; }
    public function setGame(?Game $game): static { $this->game = $game; return $this; }

    public function getTcgcsvGroupId(): int { return $this->tcgcsvGroupId; }
    public function setTcgcsvGroupId(int $tcgcsvGroupId): static { $this->tcgcsvGroupId = $tcgcsvGroupId; return $this; }

    public function getName(): string { return $this->name; }
    public function setName(string $name): static { $this->name = $name; return $this; }

    public function getCode(): ?string { return $this->code; }
    public function setCode(?string $code): static { $this->code = $code; return $this; }

    public function getReleaseDate(): ?\DateTimeImmutable { return $this->releaseDate; }
    public function setReleaseDate(?\DateTimeImmutable $releaseDate): static { $this->releaseDate = $releaseDate; return $this; }

    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): static { $this->updatedAt = new \DateTimeImmutable(); return $this; }
}
