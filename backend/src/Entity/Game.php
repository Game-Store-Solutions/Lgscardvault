<?php

namespace App\Entity;

use App\Repository\GameRepository;
use Doctrine\ORM\Mapping as ORM;

/**
 * A supported trading card game. The catalog hangs off games: sets, cards,
 * and sealed products all belong to one. tcgcsvCategoryId ties the game to
 * its TCGplayer category on TCGCSV, the primary multi-game catalog source.
 */
#[ORM\Entity(repositoryClass: GameRepository::class)]
#[ORM\Table(name: 'games')]
class Game
{
    public const CODE_MTG = 'mtg';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** Stable machine code: mtg, pokemon, onepiece, fab, riftbound, … */
    #[ORM\Column(length: 32, unique: true)]
    private string $code = '';

    #[ORM\Column(length: 120)]
    private string $name = '';

    /** TCGplayer category id on TCGCSV; null = game not synced from TCGCSV. */
    #[ORM\Column(nullable: true, unique: true)]
    private ?int $tcgcsvCategoryId = null;

    /** Display order in game pickers. */
    #[ORM\Column(options: ['default' => 0])]
    private int $position = 0;

    /** Inactive games stay in the catalog but disappear from pickers. */
    #[ORM\Column(options: ['default' => true])]
    private bool $active = true;

    public function getId(): ?int { return $this->id; }

    public function getCode(): string { return $this->code; }
    public function setCode(string $code): static { $this->code = $code; return $this; }

    public function getName(): string { return $this->name; }
    public function setName(string $name): static { $this->name = $name; return $this; }

    public function getTcgcsvCategoryId(): ?int { return $this->tcgcsvCategoryId; }
    public function setTcgcsvCategoryId(?int $tcgcsvCategoryId): static { $this->tcgcsvCategoryId = $tcgcsvCategoryId; return $this; }

    public function getPosition(): int { return $this->position; }
    public function setPosition(int $position): static { $this->position = $position; return $this; }

    public function isActive(): bool { return $this->active; }
    public function setActive(bool $active): static { $this->active = $active; return $this; }

    public function isMtg(): bool { return self::CODE_MTG === $this->code; }
}
