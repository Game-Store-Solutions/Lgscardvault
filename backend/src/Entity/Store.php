<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\Repository\StoreRepository;
use App\State\ActiveStoreCollectionProvider;
use App\State\StoreAdminProcessor;
use App\State\StoreBySlugProvider;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: StoreRepository::class)]
#[ORM\Table(name: 'stores')]
#[ORM\UniqueConstraint(name: 'UNIQ_STORE_SLUG', fields: ['slug'])]
#[ApiResource(
    operations: [
        new GetCollection(
            uriTemplate: '/stores',
            normalizationContext: ['groups' => ['store:read']],
            provider: ActiveStoreCollectionProvider::class,
        ),
        new Get(
            uriTemplate: '/stores/{slug}',
            uriVariables: ['slug'],
            normalizationContext: ['groups' => ['store:read']],
            provider: StoreBySlugProvider::class,
        ),
        new GetCollection(
            uriTemplate: '/admin/stores',
            security: "is_granted('ROLE_SUPER_ADMIN')",
            normalizationContext: ['groups' => ['store:read', 'store:admin']],
        ),
        new Post(
            uriTemplate: '/admin/stores',
            security: "is_granted('ROLE_SUPER_ADMIN')",
            normalizationContext: ['groups' => ['store:read', 'store:admin']],
            denormalizationContext: ['groups' => ['store:admin_write']],
            processor: StoreAdminProcessor::class,
        ),
        new Patch(
            uriTemplate: '/admin/stores/{id}',
            security: "is_granted('ROLE_SUPER_ADMIN')",
            normalizationContext: ['groups' => ['store:read', 'store:admin']],
            denormalizationContext: ['groups' => ['store:admin_write']],
            processor: StoreAdminProcessor::class,
        ),
        new Delete(
            uriTemplate: '/admin/stores/{id}',
            security: "is_granted('ROLE_SUPER_ADMIN')",
        ),
    ],
)]
class Store
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['store:read', 'store:admin', 'inventory:read', 'user:read'])]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    #[Assert\NotBlank]
    #[Groups(['store:read', 'store:admin', 'store:admin_write', 'inventory:read', 'user:read'])]
    private ?string $name = null;

    #[ORM\Column(length: 255)]
    #[Assert\NotBlank]
    #[Assert\Regex(pattern: '/^[a-z0-9-]+$/', message: 'Slug must be lowercase alphanumeric with hyphens.')]
    #[Groups(['store:read', 'store:admin', 'store:admin_write', 'inventory:read', 'user:read'])]
    private ?string $slug = null;

    #[ORM\ManyToOne(inversedBy: 'ownedStores')]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['store:read', 'store:admin', 'store:admin_write'])]
    private ?User $owner = null;

    /** @var Collection<int, StoreStaff> */
    #[ORM\OneToMany(mappedBy: 'store', targetEntity: StoreStaff::class, cascade: ['persist'], orphanRemoval: true)]
    private Collection $staff;

    #[ORM\Column]
    #[Groups(['store:read', 'store:admin', 'store:admin_write'])]
    private bool $isActive = true;

    /** Marketplace hero spotlight — chosen by a platform admin. */
    #[ORM\Column(options: ['default' => false])]
    #[Groups(['store:read', 'store:admin', 'store:admin_write'])]
    private bool $featured = false;

    #[ORM\Column(options: ['default' => 1000])]
    #[Assert\PositiveOrZero]
    #[Groups(['store:read', 'store:admin', 'store:admin_write'])]
    private int $spotlightMinPriceCents = 1000;

    // --- Storefront branding (managed by the owner via /settings) ---

    #[ORM\Column(length: 7, nullable: true)]
    #[Assert\Regex(pattern: '/^#[0-9a-fA-F]{6}$/', message: 'Use a 6-digit hex color like #6d5efc.')]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $primaryColor = null;

    #[ORM\Column(length: 7, nullable: true)]
    #[Assert\Regex(pattern: '/^#[0-9a-fA-F]{6}$/', message: 'Use a 6-digit hex color like #ff7a59.')]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $accentColor = null;

    #[ORM\Column(length: 7, nullable: true)]
    #[Assert\Regex(pattern: '/^#[0-9a-fA-F]{6}$/', message: 'Use a 6-digit hex color like #f7f8fa.')]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $backgroundColor = null;

    #[ORM\Column(length: 7, nullable: true)]
    #[Assert\Regex(pattern: '/^#[0-9a-fA-F]{6}$/', message: 'Use a 6-digit hex color like #ffffff.')]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $surfaceColor = null;

    #[ORM\Column(length: 7, nullable: true)]
    #[Assert\Regex(pattern: '/^#[0-9a-fA-F]{6}$/', message: 'Use a 6-digit hex color like #0f172a.')]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $textColor = null;

    #[ORM\Column(length: 7, nullable: true)]
    #[Assert\Regex(pattern: '/^#[0-9a-fA-F]{6}$/', message: 'Use a 6-digit hex color like #64748b.')]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $mutedColor = null;

    #[ORM\Column(length: 7, nullable: true)]
    #[Assert\Regex(pattern: '/^#[0-9a-fA-F]{6}$/', message: 'Use a 6-digit hex color like #e7e9ee.')]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $borderColor = null;

    /** Hairline width in px for cards, inputs, and glass panels (0–8). */
    #[ORM\Column(type: 'smallint', options: ['default' => 1])]
    #[Assert\Range(min: 0, max: 8)]
    #[Groups(['store:read', 'store:admin'])]
    private int $borderThickness = 1;

    /** Backdrop blur in px for glass panels and chrome (0–40). */
    #[ORM\Column(type: 'smallint', options: ['default' => 12])]
    #[Assert\Range(min: 0, max: 40)]
    #[Groups(['store:read', 'store:admin'])]
    private int $surfaceBlur = 12;

    /** Soft halo around storefront frames, in px (0–40). */
    #[ORM\Column(type: 'smallint', options: ['default' => 0])]
    #[Assert\Range(min: 0, max: 40)]
    #[Groups(['store:read', 'store:admin'])]
    private int $borderGlow = 0;

    /**
     * Per-piece frame style for hero, shortcut tiles, and inventory cards.
     * Keys: hero, tile, card. Each may include borderThickness, borderGlow, surfaceBlur.
     *
     * @var array<string, mixed>|null
     */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?array $frameStyles = null;

    /**
     * Dark-mode frame styles (same shape as frameStyles). Null = inherit light frames.
     *
     * @var array<string, mixed>|null
     */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?array $darkFrameStyles = null;

    /**
     * Storefront page background presets for light and dark modes.
     * Keys: light, dark (optional), opacity (0–100), colors (light/dark pattern tints).
     *
     * @var array<string, mixed>|null
     */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?array $pageBackgrounds = null;

    #[ORM\Column(length: 1024, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $logoUrl = null;

    #[ORM\Column(length: 1024, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $heroImageUrl = null;

    #[ORM\Column(length: 160, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $heroHeading = null;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $heroSubheading = null;

    #[ORM\Column(length: 160, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $tagline = null;

    #[ORM\Column(length: 32, options: ['default' => 'gallery'])]
    #[Assert\Choice(choices: ['gallery', 'marketplace'])]
    #[Groups(['store:read', 'store:admin'])]
    private string $cardDisplayStyle = 'gallery';

    #[ORM\Column(length: 32, options: ['default' => 'cinematic'])]
    #[Assert\Choice(choices: [
        'cinematic', 'living-inventory', 'trading-table', 'event-board', 'floating-cards',
        'floating-collection', 'store-story-hero', 'collectors-shelf', 'open-binder',
        'store-counter', 'planeswalkers-desk', 'shipping-station', 'trophy-wall',
        'convention-booth', 'library-shelf', 'world-map', 'gallery-wall', 'vault',
        'command-center', 'guild-hall', 'mosaic-hero', 'store-window', 'day-night-hero',
        'storefront', 'featured-card', 'collection', 'full-art', 'trading-desk',
        'mascot', 'dynamic', 'video', 'minimal', 'banner', 'spotlight',
    ])]
    #[Groups(['store:read', 'store:admin'])]
    private string $heroLayout = 'cinematic';

    /**
     * Optional dark-mode palette: the same seven branding color keys
     * (primaryColor … borderColor), applied INSTEAD of the base palette when
     * the shopper's theme toggle is dark. Null = derive dark styling from
     * the base palette as before.
     *
     * @var array<string, string>|null
     */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?array $darkColors = null;

    /**
     * Sell/trade payout rates as percentages of market price, plus an
     * optional promo window and premium buy-list rates. Keys (all optional):
     * creditRatePercent, cashRatePercent, buylistCreditRatePercent,
     * buylistCashRatePercent, promoCreditRatePercent, promoCashRatePercent,
     * promoStartsAt, promoEndsAt (ISO dates). Null = platform defaults.
     *
     * @var array<string, mixed>|null
     */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?array $tradeRates = null;

    // --- Storefront footer: hours, contact, social links (owner-managed) ---

    /** Freeform opening hours, one line per range ("Mon–Fri 12–9pm"). */
    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $hoursText = null;

    #[ORM\Column(length: 255, nullable: true)]
    #[Assert\Email]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $contactEmail = null;

    #[ORM\Column(length: 1024, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $websiteUrl = null;

    #[ORM\Column(length: 1024, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $facebookUrl = null;

    #[ORM\Column(length: 1024, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $instagramUrl = null;

    #[ORM\Column(length: 1024, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $twitterUrl = null;

    #[ORM\Column(length: 1024, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $discordUrl = null;

    /**
     * Community events for the event-board hero and /events calendar page.
     * Keys: boardHeading, boardIntro, calendarUrl (https), items[] with id, title,
     * startsAt (ISO-8601), description, location, externalUrl, pinned.
     *
     * @var array<string, mixed>|null
     */
    #[ORM\Column(type: 'json', nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?array $communityEvents = null;

    // --- Enterprise onboarding: application status ---

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    /**
     * Application lifecycle for self-serve store signups: `pending` until a
     * platform admin approves (which also flips isActive on). Admin-provisioned
     * stores default to `approved`.
     */
    #[ORM\Column(length: 16, options: ['default' => self::STATUS_APPROVED])]
    #[Assert\Choice(choices: [self::STATUS_PENDING, self::STATUS_APPROVED, self::STATUS_REJECTED])]
    #[Groups(['store:read', 'store:admin'])]
    private string $status = self::STATUS_APPROVED;

    #[ORM\Column(type: 'text', nullable: true)]
    #[Groups(['store:admin'])]
    private ?string $rejectionReason = null;

    // --- Business address (collected during onboarding) ---

    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $addressLine1 = null;

    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $addressLine2 = null;

    #[ORM\Column(length: 128, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $city = null;

    #[ORM\Column(length: 128, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $region = null;

    #[ORM\Column(length: 32, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $postalCode = null;

    #[ORM\Column(length: 2, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $country = null;

    #[ORM\Column(length: 32, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $phone = null;

    #[ORM\Column(type: 'float', nullable: true)]
    #[Groups(['store:admin'])]
    private ?float $latitude = null;

    #[ORM\Column(type: 'float', nullable: true)]
    #[Groups(['store:admin'])]
    private ?float $longitude = null;

    // --- Subscription plan / tier (selected during onboarding) ---

    /** Never billed: free tier, or a paid store that has not paid yet. */
    public const SUBSCRIPTION_INACTIVE = 'inactive';
    /** Signed up but the card was never captured — no access to paid features. */
    public const SUBSCRIPTION_PAYMENT_REQUIRED = 'payment_required';
    /** Paid through {@see $currentPeriodEnd}. */
    public const SUBSCRIPTION_ACTIVE = 'active';
    /** A renewal was declined; still being retried under the dunning schedule. */
    public const SUBSCRIPTION_PAST_DUE = 'past_due';
    /** Dunning exhausted. Requires a new card, and a human decision to restore. */
    public const SUBSCRIPTION_SUSPENDED = 'suspended';

    #[ORM\Column(length: 32, nullable: true)]
    #[Groups(['store:read', 'store:admin'])]
    private ?string $planKey = null;

    #[ORM\Column(length: 32, options: ['default' => 'inactive'])]
    #[Groups(['store:admin'])]
    private string $subscriptionStatus = self::SUBSCRIPTION_INACTIVE;

    /**
     * End of the period already paid for, and therefore the moment the next
     * renewal falls due. Null for free tiers, which are never charged.
     */
    #[ORM\Column(nullable: true)]
    #[Groups(['store:admin'])]
    private ?\DateTimeImmutable $currentPeriodEnd = null;

    #[ORM\Column(nullable: true)]
    #[Groups(['store:admin'])]
    private ?\DateTimeImmutable $lastChargedAt = null;

    /** Consecutive failed renewal attempts; reset to zero on any success. */
    #[ORM\Column(options: ['default' => 0])]
    private int $billingAttempts = 0;

    /** Dunning backoff — the renewal is not retried before this moment. */
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $nextAttemptAt = null;

    /** card | apple_pay | google_pay */
    #[ORM\Column(length: 32, nullable: true)]
    #[Groups(['store:admin'])]
    private ?string $paymentMethodType = null;

    /** Opaque reference from the payment processor (nonce / transaction id). */
    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['store:admin'])]
    private ?string $paymentReference = null;

    #[ORM\Column(length: 8, nullable: true)]
    #[Groups(['store:admin'])]
    private ?string $paymentLast4 = null;

    /** Processor customer id holding the vaulted subscription card. Never exposed by the API. */
    #[ORM\Column(length: 64, nullable: true)]
    private ?string $paymentCustomerId = null;

    /** Processor id of the card on file charged for renewals. Never exposed by the API. */
    #[ORM\Column(length: 64, nullable: true)]
    private ?string $paymentCardId = null;

    #[ORM\Column]
    #[Groups(['store:read', 'store:admin'])]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, InventoryItem> */
    #[ORM\OneToMany(mappedBy: 'store', targetEntity: InventoryItem::class, orphanRemoval: true)]
    private Collection $inventoryItems;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->inventoryItems = new ArrayCollection();
        $this->staff = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(string $name): static
    {
        $this->name = $name;

        return $this;
    }

    public function getSlug(): ?string
    {
        return $this->slug;
    }

    public function setSlug(string $slug): static
    {
        $this->slug = $slug;

        return $this;
    }

    public function getOwner(): ?User
    {
        return $this->owner;
    }

    public function setOwner(?User $owner): static
    {
        $this->owner = $owner;

        return $this;
    }

    /** @return Collection<int, StoreStaff> */
    public function getStaff(): Collection
    {
        return $this->staff;
    }

    public function isOwnedBy(User $user): bool
    {
        return $this->owner?->getId() === $user->getId();
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function setIsActive(bool $isActive): static
    {
        $this->isActive = $isActive;

        return $this;
    }

    public function isFeatured(): bool
    {
        return $this->featured;
    }

    public function setFeatured(bool $featured): static
    {
        $this->featured = $featured;

        return $this;
    }

    public function getSpotlightMinPriceCents(): int
    {
        return $this->spotlightMinPriceCents;
    }

    public function setSpotlightMinPriceCents(int $spotlightMinPriceCents): static
    {
        $this->spotlightMinPriceCents = $spotlightMinPriceCents;

        return $this;
    }

    public function getPrimaryColor(): ?string
    {
        return $this->primaryColor;
    }

    public function setPrimaryColor(?string $primaryColor): static
    {
        $this->primaryColor = $primaryColor;

        return $this;
    }

    public function getAccentColor(): ?string
    {
        return $this->accentColor;
    }

    public function setAccentColor(?string $accentColor): static
    {
        $this->accentColor = $accentColor;

        return $this;
    }

    public function getBackgroundColor(): ?string
    {
        return $this->backgroundColor;
    }

    public function setBackgroundColor(?string $backgroundColor): static
    {
        $this->backgroundColor = $backgroundColor;

        return $this;
    }

    public function getSurfaceColor(): ?string
    {
        return $this->surfaceColor;
    }

    public function setSurfaceColor(?string $surfaceColor): static
    {
        $this->surfaceColor = $surfaceColor;

        return $this;
    }

    public function getTextColor(): ?string
    {
        return $this->textColor;
    }

    public function setTextColor(?string $textColor): static
    {
        $this->textColor = $textColor;

        return $this;
    }

    public function getMutedColor(): ?string
    {
        return $this->mutedColor;
    }

    public function setMutedColor(?string $mutedColor): static
    {
        $this->mutedColor = $mutedColor;

        return $this;
    }

    public function getBorderColor(): ?string
    {
        return $this->borderColor;
    }

    public function setBorderColor(?string $borderColor): static
    {
        $this->borderColor = $borderColor;

        return $this;
    }

    public function getBorderThickness(): int
    {
        return $this->borderThickness;
    }

    public function setBorderThickness(int $borderThickness): static
    {
        $this->borderThickness = $borderThickness;

        return $this;
    }

    public function getSurfaceBlur(): int
    {
        return $this->surfaceBlur;
    }

    public function setSurfaceBlur(int $surfaceBlur): static
    {
        $this->surfaceBlur = $surfaceBlur;

        return $this;
    }

    public function getBorderGlow(): int
    {
        return $this->borderGlow;
    }

    public function setBorderGlow(int $borderGlow): static
    {
        $this->borderGlow = $borderGlow;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getFrameStyles(): ?array
    {
        return $this->frameStyles;
    }

    /** @param array<string, mixed>|null $frameStyles */
    public function setFrameStyles(?array $frameStyles): static
    {
        $this->frameStyles = $frameStyles;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getDarkFrameStyles(): ?array
    {
        return $this->darkFrameStyles;
    }

    /** @param array<string, mixed>|null $darkFrameStyles */
    public function setDarkFrameStyles(?array $darkFrameStyles): static
    {
        $this->darkFrameStyles = $darkFrameStyles;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getPageBackgrounds(): ?array
    {
        return $this->pageBackgrounds;
    }

    /** @param array<string, mixed>|null $pageBackgrounds */
    public function setPageBackgrounds(?array $pageBackgrounds): static
    {
        $this->pageBackgrounds = $pageBackgrounds;

        return $this;
    }

    public function getLogoUrl(): ?string
    {
        return $this->logoUrl;
    }

    public function setLogoUrl(?string $logoUrl): static
    {
        $this->logoUrl = $logoUrl;

        return $this;
    }

    public function getHeroImageUrl(): ?string
    {
        return $this->heroImageUrl;
    }

    public function setHeroImageUrl(?string $heroImageUrl): static
    {
        $this->heroImageUrl = $heroImageUrl;

        return $this;
    }

    public function getHeroHeading(): ?string
    {
        return $this->heroHeading;
    }

    public function setHeroHeading(?string $heroHeading): static
    {
        $this->heroHeading = $heroHeading;

        return $this;
    }

    public function getHeroSubheading(): ?string
    {
        return $this->heroSubheading;
    }

    public function setHeroSubheading(?string $heroSubheading): static
    {
        $this->heroSubheading = $heroSubheading;

        return $this;
    }

    public function getTagline(): ?string
    {
        return $this->tagline;
    }

    public function setTagline(?string $tagline): static
    {
        $this->tagline = $tagline;

        return $this;
    }

    public function getCardDisplayStyle(): string
    {
        return $this->cardDisplayStyle;
    }

    public function setCardDisplayStyle(string $cardDisplayStyle): static
    {
        $this->cardDisplayStyle = $cardDisplayStyle;

        return $this;
    }

    public function getHeroLayout(): string
    {
        return $this->heroLayout;
    }

    public function setHeroLayout(string $heroLayout): static
    {
        $this->heroLayout = $heroLayout;

        return $this;
    }

    /** @return array<string, string>|null */
    public function getDarkColors(): ?array
    {
        return $this->darkColors;
    }

    /** @param array<string, string>|null $darkColors */
    public function setDarkColors(?array $darkColors): static
    {
        $this->darkColors = $darkColors;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getTradeRates(): ?array
    {
        return $this->tradeRates;
    }

    /** @param array<string, mixed>|null $tradeRates */
    public function setTradeRates(?array $tradeRates): static
    {
        $this->tradeRates = $tradeRates;

        return $this;
    }

    public function getHoursText(): ?string
    {
        return $this->hoursText;
    }

    public function setHoursText(?string $hoursText): static
    {
        $this->hoursText = $hoursText;

        return $this;
    }

    public function getContactEmail(): ?string
    {
        return $this->contactEmail;
    }

    public function setContactEmail(?string $contactEmail): static
    {
        $this->contactEmail = $contactEmail;

        return $this;
    }

    public function getWebsiteUrl(): ?string
    {
        return $this->websiteUrl;
    }

    public function setWebsiteUrl(?string $websiteUrl): static
    {
        $this->websiteUrl = $websiteUrl;

        return $this;
    }

    public function getFacebookUrl(): ?string
    {
        return $this->facebookUrl;
    }

    public function setFacebookUrl(?string $facebookUrl): static
    {
        $this->facebookUrl = $facebookUrl;

        return $this;
    }

    public function getInstagramUrl(): ?string
    {
        return $this->instagramUrl;
    }

    public function setInstagramUrl(?string $instagramUrl): static
    {
        $this->instagramUrl = $instagramUrl;

        return $this;
    }

    public function getTwitterUrl(): ?string
    {
        return $this->twitterUrl;
    }

    public function setTwitterUrl(?string $twitterUrl): static
    {
        $this->twitterUrl = $twitterUrl;

        return $this;
    }

    public function getDiscordUrl(): ?string
    {
        return $this->discordUrl;
    }

    public function setDiscordUrl(?string $discordUrl): static
    {
        $this->discordUrl = $discordUrl;

        return $this;
    }

    /** @return array<string, mixed>|null */
    public function getCommunityEvents(): ?array
    {
        return $this->communityEvents;
    }

    /** @param array<string, mixed>|null $communityEvents */
    public function setCommunityEvents(?array $communityEvents): static
    {
        $this->communityEvents = $communityEvents;

        return $this;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(string $status): static
    {
        $this->status = $status;

        return $this;
    }

    public function getRejectionReason(): ?string
    {
        return $this->rejectionReason;
    }

    public function setRejectionReason(?string $rejectionReason): static
    {
        $this->rejectionReason = $rejectionReason;

        return $this;
    }

    public function getAddressLine1(): ?string
    {
        return $this->addressLine1;
    }

    public function setAddressLine1(?string $addressLine1): static
    {
        $this->addressLine1 = $addressLine1;

        return $this;
    }

    public function getAddressLine2(): ?string
    {
        return $this->addressLine2;
    }

    public function setAddressLine2(?string $addressLine2): static
    {
        $this->addressLine2 = $addressLine2;

        return $this;
    }

    public function getCity(): ?string
    {
        return $this->city;
    }

    public function setCity(?string $city): static
    {
        $this->city = $city;

        return $this;
    }

    public function getRegion(): ?string
    {
        return $this->region;
    }

    public function setRegion(?string $region): static
    {
        $this->region = $region;

        return $this;
    }

    public function getPostalCode(): ?string
    {
        return $this->postalCode;
    }

    public function setPostalCode(?string $postalCode): static
    {
        $this->postalCode = $postalCode;

        return $this;
    }

    public function getCountry(): ?string
    {
        return $this->country;
    }

    public function setCountry(?string $country): static
    {
        $this->country = $country;

        return $this;
    }

    public function getPhone(): ?string
    {
        return $this->phone;
    }

    public function setPhone(?string $phone): static
    {
        $this->phone = $phone;

        return $this;
    }

    public function getLatitude(): ?float
    {
        return $this->latitude;
    }

    public function setLatitude(?float $latitude): static
    {
        $this->latitude = $latitude;

        return $this;
    }

    public function getLongitude(): ?float
    {
        return $this->longitude;
    }

    public function setLongitude(?float $longitude): static
    {
        $this->longitude = $longitude;

        return $this;
    }

    public function getPlanKey(): ?string
    {
        return $this->planKey;
    }

    public function setPlanKey(?string $planKey): static
    {
        $this->planKey = $planKey;

        return $this;
    }

    public function getSubscriptionStatus(): string
    {
        return $this->subscriptionStatus;
    }

    public function setSubscriptionStatus(string $subscriptionStatus): static
    {
        $this->subscriptionStatus = $subscriptionStatus;

        return $this;
    }

    public function getCurrentPeriodEnd(): ?\DateTimeImmutable
    {
        return $this->currentPeriodEnd;
    }

    public function setCurrentPeriodEnd(?\DateTimeImmutable $currentPeriodEnd): static
    {
        $this->currentPeriodEnd = $currentPeriodEnd;

        return $this;
    }

    public function getLastChargedAt(): ?\DateTimeImmutable
    {
        return $this->lastChargedAt;
    }

    public function getBillingAttempts(): int
    {
        return $this->billingAttempts;
    }

    public function getNextAttemptAt(): ?\DateTimeImmutable
    {
        return $this->nextAttemptAt;
    }

    public function setNextAttemptAt(?\DateTimeImmutable $nextAttemptAt): static
    {
        $this->nextAttemptAt = $nextAttemptAt;

        return $this;
    }

    /** True once the paid period has lapsed and no backoff is pending. */
    public function isRenewalDue(\DateTimeImmutable $now): bool
    {
        if (null === $this->currentPeriodEnd || $this->currentPeriodEnd > $now) {
            return false;
        }

        return null === $this->nextAttemptAt || $this->nextAttemptAt <= $now;
    }

    /**
     * Advance to the next monthly period after a successful charge.
     *
     * Measured from the previous period end rather than "now" so that a cron
     * that runs late — or a retry days into dunning — never shortens or shifts
     * the owner's billing date.
     */
    public function markSubscriptionCharged(\DateTimeImmutable $now): static
    {
        $anchor = $this->currentPeriodEnd ?? $now;

        // A long outage could leave the anchor several periods behind; walk it
        // forward so we bill one period rather than immediately falling due again.
        do {
            $anchor = $anchor->modify('+1 month');
        } while ($anchor <= $now);

        $this->currentPeriodEnd = $anchor;
        $this->lastChargedAt = $now;
        $this->billingAttempts = 0;
        $this->nextAttemptAt = null;
        $this->subscriptionStatus = self::SUBSCRIPTION_ACTIVE;

        return $this;
    }

    /** Record a declined renewal and schedule the next attempt. */
    public function markSubscriptionAttemptFailed(\DateTimeImmutable $now, ?\DateTimeImmutable $retryAt): static
    {
        ++$this->billingAttempts;
        $this->nextAttemptAt = $retryAt;
        $this->subscriptionStatus = null === $retryAt
            ? self::SUBSCRIPTION_SUSPENDED
            : self::SUBSCRIPTION_PAST_DUE;

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

    public function getPaymentReference(): ?string
    {
        return $this->paymentReference;
    }

    public function setPaymentReference(?string $paymentReference): static
    {
        $this->paymentReference = $paymentReference;

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

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /** @return Collection<int, InventoryItem> */
    public function getInventoryItems(): Collection
    {
        return $this->inventoryItems;
    }
}
