<?php

namespace App\Entity;

use App\Repository\ReferenceDeckRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * A harvested community/reference Commander decklist.
 *
 * Together with ReferenceDeckCard this is the deck-membership matrix the synergy
 * engine reads: for a commander and strategy we load ten decks' worth of oracle
 * ids (~1,000 rows) and compute co-occurrence in memory. That is deliberately
 * cheaper and more accurate than materialising a card-pair table, which would be
 * O(n²) per deck and would need re-truncating every time thresholds change.
 *
 * Rows are a working set, not an archive: `ReferenceDeckPruner` drops lists once
 * their aggregates are settled, so what we keep long-term is derived statistics.
 */
#[ORM\Entity(repositoryClass: ReferenceDeckRepository::class)]
#[ORM\Table(name: 'reference_decks')]
#[ORM\UniqueConstraint(name: 'uniq_reference_deck_external', columns: ['provider', 'external_id'])]
#[ORM\Index(name: 'idx_reference_deck_commander', columns: ['commander_oracle_id', 'popularity'])]
#[ORM\Index(name: 'idx_reference_deck_fetched', columns: ['fetched_at'])]
class ReferenceDeck
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 32)]
    private string $provider;

    #[ORM\Column(name: 'external_id', length: 128)]
    private string $externalId;

    #[ORM\Column(name: 'commander_oracle_id', type: 'uuid')]
    private Uuid $commanderOracleId;

    /** Second commander for partner / background pairings. */
    #[ORM\Column(name: 'partner_oracle_id', type: 'uuid', nullable: true)]
    private ?Uuid $partnerOracleId = null;

    #[ORM\Column(length: 255)]
    private string $name = '';

    /** Provider-normalized 0..1 relevance signal (view counts, product status). */
    #[ORM\Column]
    private float $popularity = 0.0;

    #[ORM\Column(nullable: true)]
    private ?int $bracket = null;

    /** Raw provider strategy tags, kept verbatim for auditing and re-classification. */
    /** @var list<string> */
    #[ORM\Column(name: 'provider_tags', type: 'json')]
    private array $providerTags = [];

    /** Strategy slugs this deck was classified into, strongest first. */
    /** @var list<string> */
    #[ORM\Column(name: 'strategy_ids', type: 'json')]
    private array $strategyIds = [];

    #[ORM\Column(name: 'card_count')]
    private int $cardCount = 0;

    #[ORM\Column(length: 512, nullable: true)]
    private ?string $url = null;

    #[ORM\Column(name: 'source_updated_at', nullable: true)]
    private ?\DateTimeImmutable $sourceUpdatedAt = null;

    #[ORM\Column(name: 'fetched_at')]
    private \DateTimeImmutable $fetchedAt;

    /** @var Collection<int, ReferenceDeckCard> */
    #[ORM\OneToMany(mappedBy: 'referenceDeck', targetEntity: ReferenceDeckCard::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $cards;

    public function __construct(string $provider, string $externalId, Uuid $commanderOracleId)
    {
        $this->provider = $provider;
        $this->externalId = $externalId;
        $this->commanderOracleId = $commanderOracleId;
        $this->fetchedAt = new \DateTimeImmutable();
        $this->cards = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }

    public function getProvider(): string { return $this->provider; }

    public function getExternalId(): string { return $this->externalId; }

    public function getCommanderOracleId(): Uuid { return $this->commanderOracleId; }

    public function getPartnerOracleId(): ?Uuid { return $this->partnerOracleId; }
    public function setPartnerOracleId(?Uuid $oracleId): static { $this->partnerOracleId = $oracleId; return $this; }

    public function getName(): string { return $this->name; }
    public function setName(string $name): static { $this->name = mb_substr($name, 0, 255); return $this; }

    public function getPopularity(): float { return $this->popularity; }
    public function setPopularity(float $popularity): static { $this->popularity = max(0.0, min(1.0, $popularity)); return $this; }

    public function getBracket(): ?int { return $this->bracket; }
    public function setBracket(?int $bracket): static { $this->bracket = $bracket; return $this; }

    /** @return list<string> */
    public function getProviderTags(): array { return $this->providerTags; }
    /** @param list<string> $tags */
    public function setProviderTags(array $tags): static { $this->providerTags = array_values($tags); return $this; }

    /** @return list<string> */
    public function getStrategyIds(): array { return $this->strategyIds; }
    /** @param list<string> $strategyIds */
    public function setStrategyIds(array $strategyIds): static { $this->strategyIds = array_values($strategyIds); return $this; }

    public function hasStrategy(string $strategyId): bool { return in_array($strategyId, $this->strategyIds, true); }

    public function getCardCount(): int { return $this->cardCount; }
    public function setCardCount(int $count): static { $this->cardCount = max(0, $count); return $this; }

    public function getUrl(): ?string { return $this->url; }
    public function setUrl(?string $url): static { $this->url = null === $url ? null : mb_substr($url, 0, 512); return $this; }

    public function getSourceUpdatedAt(): ?\DateTimeImmutable { return $this->sourceUpdatedAt; }
    public function setSourceUpdatedAt(?\DateTimeImmutable $at): static { $this->sourceUpdatedAt = $at; return $this; }

    public function getFetchedAt(): \DateTimeImmutable { return $this->fetchedAt; }
    public function setFetchedAt(\DateTimeImmutable $fetchedAt): static { $this->fetchedAt = $fetchedAt; return $this; }
    public function touchFetchedAt(): static { $this->fetchedAt = new \DateTimeImmutable(); return $this; }

    /** @return Collection<int, ReferenceDeckCard> */
    public function getCards(): Collection { return $this->cards; }

    public function addCard(ReferenceDeckCard $card): static
    {
        if (!$this->cards->contains($card)) {
            $this->cards->add($card);
        }

        return $this;
    }

    public function clearCards(): static
    {
        $this->cards->clear();

        return $this;
    }
}
