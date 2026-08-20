<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use App\Repository\CardRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity(repositoryClass: CardRepository::class)]
#[ORM\Table(name: 'cards')]
#[ORM\Index(name: 'IDX_CARD_NAME', fields: ['name'])]
#[ORM\Index(name: 'IDX_CARD_ORACLE_ID', fields: ['oracleId'])]
#[ApiResource(
    operations: [
        new Get(normalizationContext: ['groups' => ['card:read']]),
    ],
)]
class Card
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private Uuid $id;

    #[ORM\Column(type: 'uuid')]
    #[Groups(['card:read', 'inventory:read'])]
    private Uuid $oracleId;

    /**
     * The game this card belongs to. Null means Magic (the pre-multi-game
     * catalog default); use resolvedGameCode() when serializing.
     */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Game $game = null;

    /** TCGCSV set linkage for cards sourced from TCGCSV (non-MTG catalogs). */
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(name: 'game_set_id', nullable: true, onDelete: 'SET NULL')]
    private ?GameSet $gameSet = null;

    /** TCGplayer product id, when known — joins the card to TCGCSV pricing. */
    #[ORM\Column(type: 'bigint', nullable: true)]
    private ?string $tcgplayerProductId = null;

    #[ORM\Column(length: 255)]
    #[Groups(['card:read', 'inventory:read'])]
    private string $name;

    #[ORM\Column(length: 40)]
    #[Groups(['card:read', 'inventory:read'])]
    private string $setCode;

    #[ORM\Column(length: 20)]
    #[Groups(['card:read', 'inventory:read'])]
    private string $collectorNumber;

    #[ORM\Column(length: 20, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $rarity = null;

    #[ORM\Column(length: 64, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $manaCost = null;

    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $typeLine = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $oracleText = null;

    #[ORM\Column(type: 'float', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?float $cmc = null;

    /** @var array<string, mixed>|null */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?array $imageUris = null;

    /** @var array<string, mixed>|null */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?array $prices = null;

    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $setName = null;

    /** @var list<string>|null */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?array $colors = null;

    /** @var list<string>|null */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?array $colorIdentity = null;

    /** @var list<string>|null */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?array $keywords = null;

    #[ORM\Column(length: 16, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $power = null;

    #[ORM\Column(length: 16, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $toughness = null;

    #[ORM\Column(length: 16, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $loyalty = null;

    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $artist = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $flavorText = null;

    /** @var array<string, mixed>|null */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?array $legalities = null;

    /** @var list<string>|null */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?array $finishes = null;

    /** @var list<string>|null */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?array $games = null;

    #[ORM\Column(type: 'date_immutable', nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?\DateTimeImmutable $releasedAt = null;

    #[ORM\Column(length: 16, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $lang = null;

    #[ORM\Column(length: 32, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $layout = null;

    #[ORM\Column(length: 512, nullable: true)]
    #[Groups(['card:read', 'inventory:read'])]
    private ?string $scryfallUri = null;

    /**
     * Complete raw payload from Scryfall so no information is lost.
     *
     * @var array<string, mixed>|null
     */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['card:read'])]
    private ?array $scryfallData = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $scryfallUpdatedAt = null;

    public function __construct(Uuid $id)
    {
        $this->id = $id;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getGame(): ?Game { return $this->game; }
    public function setGame(?Game $game): static { $this->game = $game; return $this; }

    public function getGameSet(): ?GameSet { return $this->gameSet; }
    public function setGameSet(?GameSet $gameSet): static { $this->gameSet = $gameSet; return $this; }

    public function getTcgplayerProductId(): ?int { return null === $this->tcgplayerProductId ? null : (int) $this->tcgplayerProductId; }
    public function setTcgplayerProductId(?int $tcgplayerProductId): static { $this->tcgplayerProductId = null === $tcgplayerProductId ? null : (string) $tcgplayerProductId; return $this; }

    /** Game code for serialization; legacy rows without a game are Magic. */
    public function resolvedGameCode(): string
    {
        return $this->game?->getCode() ?? Game::CODE_MTG;
    }

    /** Serializer-facing alias so API payloads expose the game as `gameCode`. */
    #[Groups(['card:read', 'inventory:read'])]
    public function getGameCode(): string
    {
        return $this->resolvedGameCode();
    }

    public function getOracleId(): Uuid
    {
        return $this->oracleId;
    }

    public function setOracleId(Uuid $oracleId): static
    {
        $this->oracleId = $oracleId;

        return $this;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): static
    {
        $this->name = $name;

        return $this;
    }

    public function getSetCode(): string
    {
        return $this->setCode;
    }

    public function setSetCode(string $setCode): static
    {
        $this->setCode = $setCode;

        return $this;
    }

    public function getCollectorNumber(): string
    {
        return $this->collectorNumber;
    }

    public function setCollectorNumber(string $collectorNumber): static
    {
        $this->collectorNumber = $collectorNumber;

        return $this;
    }

    public function getRarity(): ?string
    {
        return $this->rarity;
    }

    public function setRarity(?string $rarity): static
    {
        $this->rarity = $rarity;

        return $this;
    }

    public function getManaCost(): ?string
    {
        return $this->manaCost;
    }

    public function setManaCost(?string $manaCost): static
    {
        $this->manaCost = $manaCost;

        return $this;
    }

    public function getTypeLine(): ?string
    {
        return $this->typeLine;
    }

    public function setTypeLine(?string $typeLine): static
    {
        $this->typeLine = $typeLine;

        return $this;
    }

    public function getOracleText(): ?string
    {
        return $this->oracleText;
    }

    public function setOracleText(?string $oracleText): static
    {
        $this->oracleText = $oracleText;

        return $this;
    }

    public function getCmc(): ?float
    {
        return $this->cmc;
    }

    public function setCmc(?float $cmc): static
    {
        $this->cmc = $cmc;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getImageUris(): ?array
    {
        return $this->imageUris;
    }

    /** @param array<string, mixed>|null $imageUris */
    public function setImageUris(?array $imageUris): static
    {
        $this->imageUris = $imageUris;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getPrices(): ?array
    {
        return $this->prices;
    }

    /** @param array<string, mixed>|null $prices */
    public function setPrices(?array $prices): static
    {
        $this->prices = $prices;

        return $this;
    }

    public function getSetName(): ?string
    {
        return $this->setName;
    }

    public function setSetName(?string $setName): static
    {
        $this->setName = $setName;

        return $this;
    }

    /** @return list<string>|null */
    public function getColors(): ?array
    {
        return $this->colors;
    }

    /** @param list<string>|null $colors */
    public function setColors(?array $colors): static
    {
        $this->colors = $colors;

        return $this;
    }

    /** @return list<string>|null */
    public function getColorIdentity(): ?array
    {
        return $this->colorIdentity;
    }

    /** @param list<string>|null $colorIdentity */
    public function setColorIdentity(?array $colorIdentity): static
    {
        $this->colorIdentity = $colorIdentity;

        return $this;
    }

    /** @return list<string>|null */
    public function getKeywords(): ?array
    {
        return $this->keywords;
    }

    /** @param list<string>|null $keywords */
    public function setKeywords(?array $keywords): static
    {
        $this->keywords = $keywords;

        return $this;
    }

    public function getPower(): ?string
    {
        return $this->power;
    }

    public function setPower(?string $power): static
    {
        $this->power = $power;

        return $this;
    }

    public function getToughness(): ?string
    {
        return $this->toughness;
    }

    public function setToughness(?string $toughness): static
    {
        $this->toughness = $toughness;

        return $this;
    }

    public function getLoyalty(): ?string
    {
        return $this->loyalty;
    }

    public function setLoyalty(?string $loyalty): static
    {
        $this->loyalty = $loyalty;

        return $this;
    }

    public function getArtist(): ?string
    {
        return $this->artist;
    }

    public function setArtist(?string $artist): static
    {
        $this->artist = $artist;

        return $this;
    }

    public function getFlavorText(): ?string
    {
        return $this->flavorText;
    }

    public function setFlavorText(?string $flavorText): static
    {
        $this->flavorText = $flavorText;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getLegalities(): ?array
    {
        return $this->legalities;
    }

    /** @param array<string, mixed>|null $legalities */
    public function setLegalities(?array $legalities): static
    {
        $this->legalities = $legalities;

        return $this;
    }

    /** @return list<string>|null */
    public function getFinishes(): ?array
    {
        return $this->finishes;
    }

    /** @param list<string>|null $finishes */
    public function setFinishes(?array $finishes): static
    {
        $this->finishes = $finishes;

        return $this;
    }

    /** @return list<string>|null */
    public function getGames(): ?array
    {
        return $this->games;
    }

    /** @param list<string>|null $games */
    public function setGames(?array $games): static
    {
        $this->games = $games;

        return $this;
    }

    public function getReleasedAt(): ?\DateTimeImmutable
    {
        return $this->releasedAt;
    }

    public function setReleasedAt(?\DateTimeImmutable $releasedAt): static
    {
        $this->releasedAt = $releasedAt;

        return $this;
    }

    public function getLang(): ?string
    {
        return $this->lang;
    }

    public function setLang(?string $lang): static
    {
        $this->lang = $lang;

        return $this;
    }

    public function getLayout(): ?string
    {
        return $this->layout;
    }

    public function setLayout(?string $layout): static
    {
        $this->layout = $layout;

        return $this;
    }

    public function getScryfallUri(): ?string
    {
        return $this->scryfallUri;
    }

    public function setScryfallUri(?string $scryfallUri): static
    {
        $this->scryfallUri = $scryfallUri;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getScryfallData(): ?array
    {
        return $this->scryfallData;
    }

    /** @param array<string, mixed>|null $scryfallData */
    public function setScryfallData(?array $scryfallData): static
    {
        $this->scryfallData = $scryfallData;

        return $this;
    }

    /**
     * Commander Game Changer flag from the stored Scryfall payload
     * (`game_changer` on the card object / bulk files).
     */
    #[Groups(['card:read', 'inventory:read'])]
    public function isGameChanger(): bool
    {
        $data = $this->scryfallData ?? [];
        $flag = $data['game_changer'] ?? $data['gameChanger'] ?? false;

        return true === $flag || 1 === $flag || '1' === $flag || 'true' === $flag;
    }

    public function getScryfallUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->scryfallUpdatedAt;
    }

    public function setScryfallUpdatedAt(?\DateTimeImmutable $scryfallUpdatedAt): static
    {
        $this->scryfallUpdatedAt = $scryfallUpdatedAt;

        return $this;
    }

    #[Groups(['card:read', 'inventory:read'])]
    public function getImageUrl(): ?string
    {
        $topLevel = $this->imageUris['large'] ?? $this->imageUris['normal'] ?? $this->imageUris['small'] ?? null;
        if (null !== $topLevel) {
            return $topLevel;
        }

        // Double-faced cards (transform, modal_dfc, flip, …) carry no top-level
        // image_uris; the art lives on each face. Fall back to the front face so
        // these cards still render a thumbnail everywhere.
        foreach ($this->getCardFaces() as $face) {
            if (isset($face['imageUrl']) && '' !== $face['imageUrl']) {
                return $face['imageUrl'];
            }
        }

        return null;
    }

    /**
     * Normalized per-face data for multi-faced cards (transform, modal_dfc, flip,
     * double_faced_token, reversible_card, …). Derived from the raw Scryfall
     * payload's `card_faces`; an empty list for ordinary single-faced cards.
     *
     * @return list<array<string, mixed>>
     */
    #[Groups(['card:read', 'inventory:read'])]
    public function getCardFaces(): array
    {
        $faces = $this->scryfallData['card_faces'] ?? null;
        if (!is_array($faces)) {
            return [];
        }

        $result = [];
        foreach ($faces as $face) {
            if (!is_array($face)) {
                continue;
            }

            $imageUris = isset($face['image_uris']) && is_array($face['image_uris']) ? $face['image_uris'] : null;

            $result[] = [
                'name' => isset($face['name']) ? (string) $face['name'] : null,
                'imageUris' => $imageUris,
                'imageUrl' => $imageUris['large'] ?? $imageUris['normal'] ?? $imageUris['small'] ?? null,
                'manaCost' => isset($face['mana_cost']) ? (string) $face['mana_cost'] : null,
                'typeLine' => isset($face['type_line']) ? (string) $face['type_line'] : null,
                'oracleText' => isset($face['oracle_text']) ? (string) $face['oracle_text'] : null,
                'power' => isset($face['power']) ? (string) $face['power'] : null,
                'toughness' => isset($face['toughness']) ? (string) $face['toughness'] : null,
                'loyalty' => isset($face['loyalty']) ? (string) $face['loyalty'] : null,
                'flavorText' => isset($face['flavor_text']) ? (string) $face['flavor_text'] : null,
                'artist' => isset($face['artist']) ? (string) $face['artist'] : null,
                'colors' => isset($face['colors']) && is_array($face['colors']) ? array_values($face['colors']) : null,
            ];
        }

        return $result;
    }
}
