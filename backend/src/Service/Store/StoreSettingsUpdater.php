<?php

namespace App\Service\Store;

use App\Entity\InventoryItem;
use App\Entity\Store;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Applies and validates owner-managed store settings (spotlight + branding).
 *
 * Keeps the controller thin: all input validation and entity mutation lives
 * here. Validation failures are signalled with InvalidArgumentException so the
 * service stays transport-agnostic; the controller maps that to a 422.
 */
final readonly class StoreSettingsUpdater
{
    private const HEX = '/^#[0-9a-fA-F]{6}$/';
    private const URL = '#^(https?://|/)#';
    private const CARD_DISPLAY_STYLES = ['gallery', 'marketplace'];
    public const SPOTLIGHT_ITEMS_CAP = 24;
    private const HERO_LAYOUTS = [
        'cinematic', 'living-inventory', 'trading-table', 'event-board', 'floating-cards',
        'floating-collection', 'store-story-hero', 'collectors-shelf', 'open-binder',
        'store-counter', 'planeswalkers-desk', 'shipping-station', 'trophy-wall',
        'convention-booth', 'library-shelf', 'world-map', 'gallery-wall', 'vault',
        'command-center', 'guild-hall', 'mosaic-hero', 'store-window', 'day-night-hero',
        'storefront', 'featured-card', 'collection', 'full-art', 'trading-desk',
        'mascot', 'dynamic', 'video', 'minimal', 'banner', 'spotlight',
    ];

    private const HERO_LAYOUT_ALIASES = [
        'floating-collection' => 'floating-cards',
        'trading-desk' => 'trading-table',
        'storefront' => 'cinematic',
        'featured-card' => 'cinematic',
        'full-art' => 'cinematic',
        'collection' => 'living-inventory',
        'minimal' => 'cinematic',
        'banner' => 'cinematic',
        'cinematic' => 'cinematic',
        'mascot' => 'cinematic',
        'dynamic' => 'cinematic',
        'video' => 'cinematic',
        'spotlight' => 'cinematic',
        'store-story-hero' => 'cinematic',
        'collectors-shelf' => 'cinematic',
        'open-binder' => 'cinematic',
        'store-counter' => 'cinematic',
        'planeswalkers-desk' => 'trading-table',
        'shipping-station' => 'living-inventory',
        'trophy-wall' => 'cinematic',
        'convention-booth' => 'cinematic',
        'library-shelf' => 'living-inventory',
        'world-map' => 'cinematic',
        'gallery-wall' => 'cinematic',
        'vault' => 'cinematic',
        'command-center' => 'cinematic',
        'guild-hall' => 'cinematic',
        'mosaic-hero' => 'living-inventory',
        'store-window' => 'cinematic',
        'day-night-hero' => 'cinematic',
    ];

    /** Branding color fields → entity setter. */
    private const COLOR_FIELDS = [
        'primaryColor' => 'setPrimaryColor',
        'accentColor' => 'setAccentColor',
        'backgroundColor' => 'setBackgroundColor',
        'surfaceColor' => 'setSurfaceColor',
        'textColor' => 'setTextColor',
        'mutedColor' => 'setMutedColor',
        'borderColor' => 'setBorderColor',
    ];

    /** Image/link-URL fields → entity setter. */
    private const URL_FIELDS = [
        'logoUrl' => 'setLogoUrl',
        'heroImageUrl' => 'setHeroImageUrl',
        'darkHeroImageUrl' => 'setDarkHeroImageUrl',
        'websiteUrl' => 'setWebsiteUrl',
        'facebookUrl' => 'setFacebookUrl',
        'instagramUrl' => 'setInstagramUrl',
        'twitterUrl' => 'setTwitterUrl',
        'discordUrl' => 'setDiscordUrl',
    ];

    /** Free-text fields → [entity setter, max length]. */
    private const TEXT_FIELDS = [
        'heroHeading' => ['setHeroHeading', 160],
        'heroSubheading' => ['setHeroSubheading', 2000],
        'tagline' => ['setTagline', 160],
        'hoursText' => ['setHoursText', 1000],
    ];

    private const URL_MAX = 1024;

    public function __construct(private EntityManagerInterface $entityManager)
    {
    }

    /**
     * Validate and apply the given settings payload, then persist.
     *
     * @param array<string, mixed> $payload
     *
     * @throws \InvalidArgumentException when a value fails validation
     */
    public function update(Store $store, array $payload): Store
    {
        if (array_key_exists('spotlightMinPriceCents', $payload)) {
            $store->setSpotlightMinPriceCents(max(0, (int) $payload['spotlightMinPriceCents']));
        }

        if (array_key_exists('spotlightMinItems', $payload) || array_key_exists('spotlightMaxItems', $payload)) {
            $minItems = $store->getSpotlightMinItems();
            $maxItems = $store->getSpotlightMaxItems();
            if (array_key_exists('spotlightMinItems', $payload)) {
                $minItems = $this->intInRange($payload['spotlightMinItems'], 'spotlightMinItems', 0, self::SPOTLIGHT_ITEMS_CAP);
            }
            if (array_key_exists('spotlightMaxItems', $payload)) {
                $maxItems = $this->intInRange($payload['spotlightMaxItems'], 'spotlightMaxItems', 1, self::SPOTLIGHT_ITEMS_CAP);
            }
            if ($minItems > $maxItems) {
                $minItems = $maxItems;
            }
            $store->setSpotlightMinItems($minItems);
            $store->setSpotlightMaxItems($maxItems);
        }

        if (array_key_exists('spotlightPinnedInventoryIds', $payload)) {
            $store->setSpotlightPinnedInventoryIds($this->normalizePinnedInventoryIds($store, $payload['spotlightPinnedInventoryIds']));
        }

        $this->applyBranding($store, $payload);

        $this->entityManager->flush();

        return $store;
    }

    /**
     * Validate and apply branding fields (colors, image URLs, hero/tagline
     * copy, card display style) without persisting. Shared by the settings
     * PATCH endpoint and store onboarding so both validate identically.
     *
     * @param array<string, mixed> $payload
     *
     * @throws \InvalidArgumentException when a value fails validation
     */
    public function applyBranding(Store $store, array $payload): void
    {
        if (array_key_exists('cardDisplayStyle', $payload)) {
            $style = $this->stringValue($payload['cardDisplayStyle']);
            if (!in_array($style, self::CARD_DISPLAY_STYLES, true)) {
                throw new \InvalidArgumentException('cardDisplayStyle must be gallery or marketplace.');
            }
            $store->setCardDisplayStyle($style);
        }

        if (array_key_exists('heroLayout', $payload)) {
            $layout = $this->stringValue($payload['heroLayout']);
            if (!in_array($layout, self::HERO_LAYOUTS, true)) {
                throw new \InvalidArgumentException('heroLayout is not a supported storefront hero style.');
            }
            $layout = self::HERO_LAYOUT_ALIASES[$layout] ?? $layout;
            $store->setHeroLayout($layout);
        }

        foreach (self::COLOR_FIELDS as $key => $setter) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }
            $value = $this->stringValue($payload[$key]);
            if ('' === $value) {
                $store->$setter(null);
            } elseif (1 === preg_match(self::HEX, $value)) {
                $store->$setter(strtolower($value));
            } else {
                throw new \InvalidArgumentException(sprintf('%s must be a 6-digit hex color like #6d5efc.', $key));
            }
        }

        foreach (self::URL_FIELDS as $key => $setter) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }
            $value = $this->stringValue($payload[$key]);
            if ('' === $value) {
                $store->$setter(null);
            } elseif (1 === preg_match(self::URL, $value)) {
                $store->$setter(mb_substr($value, 0, self::URL_MAX));
            } else {
                throw new \InvalidArgumentException(sprintf('%s must be an http(s) URL or a path starting with "/".', $key));
            }
        }

        foreach (self::TEXT_FIELDS as $key => [$setter, $max]) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }
            $value = $this->stringValue($payload[$key]);
            $store->$setter('' === $value ? null : mb_substr($value, 0, $max));
        }

        if (array_key_exists('darkColors', $payload)) {
            $raw = $payload['darkColors'];
            if (null === $raw || [] === $raw) {
                $store->setDarkColors(null);
            } elseif (!is_array($raw)) {
                throw new \InvalidArgumentException('darkColors must be an object of color fields.');
            } else {
                $clean = [];
                foreach (array_keys(self::COLOR_FIELDS) as $colorKey) {
                    $value = $this->stringValue($raw[$colorKey] ?? '');
                    if ('' === $value) {
                        continue;
                    }
                    if (1 !== preg_match(self::HEX, $value)) {
                        throw new \InvalidArgumentException(sprintf('darkColors.%s must be a 6-digit hex color like #10131c.', $colorKey));
                    }
                    $clean[$colorKey] = strtolower($value);
                }
                $store->setDarkColors([] === $clean ? null : $clean);
            }
        }

        if (array_key_exists('tradeRates', $payload)) {
            $store->setTradeRates($this->cleanTradeRates($payload['tradeRates']));
        }

        if (array_key_exists('communityEvents', $payload)) {
            $store->setCommunityEvents($this->cleanCommunityEvents($payload['communityEvents']));
        }

        if (array_key_exists('contactEmail', $payload)) {
            $value = $this->stringValue($payload['contactEmail']);
            if ('' === $value) {
                $store->setContactEmail(null);
            } elseif (false !== filter_var($value, FILTER_VALIDATE_EMAIL)) {
                $store->setContactEmail(mb_substr($value, 0, 255));
            } else {
                throw new \InvalidArgumentException('contactEmail must be a valid email address.');
            }
        }

        if (array_key_exists('borderThickness', $payload)) {
            $store->setBorderThickness($this->intInRange($payload['borderThickness'], 'borderThickness', 0, 8));
        }

        if (array_key_exists('surfaceBlur', $payload)) {
            $store->setSurfaceBlur($this->intInRange($payload['surfaceBlur'], 'surfaceBlur', 0, 40));
        }

        if (array_key_exists('borderGlow', $payload)) {
            $store->setBorderGlow($this->intInRange($payload['borderGlow'], 'borderGlow', 0, 40));
        }

        if (array_key_exists('frameStyles', $payload)) {
            $store->setFrameStyles($this->cleanFrameStyles($payload['frameStyles']));
        }

        if (array_key_exists('darkFrameStyles', $payload)) {
            $store->setDarkFrameStyles($this->cleanFrameStyles($payload['darkFrameStyles']));
        }

        if (array_key_exists('pageBackgrounds', $payload)) {
            $store->setPageBackgrounds($this->cleanPageBackgrounds($payload['pageBackgrounds']));
        }

        if (array_key_exists('heroImageOpacity', $payload)) {
            $store->setHeroImageOpacity($this->intInRange($payload['heroImageOpacity'], 'heroImageOpacity', 0, 100));
        }

        if (array_key_exists('darkHeroImageOpacity', $payload)) {
            $raw = $payload['darkHeroImageOpacity'];
            if (null === $raw || '' === $raw) {
                $store->setDarkHeroImageOpacity(null);
            } else {
                $store->setDarkHeroImageOpacity($this->intInRange($raw, 'darkHeroImageOpacity', 0, 100));
            }
        }

        if (array_key_exists('heroImagePosition', $payload)) {
            $store->setHeroImagePosition($this->intInRange($payload['heroImagePosition'], 'heroImagePosition', 0, 100));
        }

        if (array_key_exists('darkHeroImagePosition', $payload)) {
            $raw = $payload['darkHeroImagePosition'];
            if (null === $raw || '' === $raw) {
                $store->setDarkHeroImagePosition(null);
            } else {
                $store->setDarkHeroImagePosition($this->intInRange($raw, 'darkHeroImagePosition', 0, 100));
            }
        }

        if (array_key_exists('heroImagePositionX', $payload)) {
            $store->setHeroImagePositionX($this->intInRange($payload['heroImagePositionX'], 'heroImagePositionX', 0, 100));
        }

        if (array_key_exists('darkHeroImagePositionX', $payload)) {
            $raw = $payload['darkHeroImagePositionX'];
            if (null === $raw || '' === $raw) {
                $store->setDarkHeroImagePositionX(null);
            } else {
                $store->setDarkHeroImagePositionX($this->intInRange($raw, 'darkHeroImagePositionX', 0, 100));
            }
        }

        if (array_key_exists('heroImagePositionMobileX', $payload)) {
            $raw = $payload['heroImagePositionMobileX'];
            if (null === $raw || '' === $raw) {
                $store->setHeroImagePositionMobileX(null);
            } else {
                $store->setHeroImagePositionMobileX($this->intInRange($raw, 'heroImagePositionMobileX', 0, 100));
            }
        }

        if (array_key_exists('heroImagePositionMobileY', $payload)) {
            $raw = $payload['heroImagePositionMobileY'];
            if (null === $raw || '' === $raw) {
                $store->setHeroImagePositionMobileY(null);
            } else {
                $store->setHeroImagePositionMobileY($this->intInRange($raw, 'heroImagePositionMobileY', 0, 100));
            }
        }
    }

    /** @return array<string, mixed> */
    public function serialize(Store $store): array
    {
        return [
            'id' => $store->getId(),
            'name' => $store->getName(),
            'slug' => $store->getSlug(),
            'spotlightMinPriceCents' => $store->getSpotlightMinPriceCents(),
            'spotlightMinItems' => $store->getSpotlightMinItems(),
            'spotlightMaxItems' => $store->getSpotlightMaxItems(),
            'spotlightPinnedInventoryIds' => $store->getSpotlightPinnedInventoryIds(),
            'primaryColor' => $store->getPrimaryColor(),
            'accentColor' => $store->getAccentColor(),
            'backgroundColor' => $store->getBackgroundColor(),
            'surfaceColor' => $store->getSurfaceColor(),
            'textColor' => $store->getTextColor(),
            'mutedColor' => $store->getMutedColor(),
            'borderColor' => $store->getBorderColor(),
            'borderThickness' => $store->getBorderThickness(),
            'surfaceBlur' => $store->getSurfaceBlur(),
            'borderGlow' => $store->getBorderGlow(),
            'frameStyles' => $store->getFrameStyles(),
            'darkFrameStyles' => $store->getDarkFrameStyles(),
            'pageBackgrounds' => $this->normalizePageBackgroundsForRead($store->getPageBackgrounds()),
            'logoUrl' => $store->getLogoUrl(),
            'heroImageUrl' => $store->getHeroImageUrl(),
            'darkHeroImageUrl' => $store->getDarkHeroImageUrl(),
            'heroImageOpacity' => $store->getHeroImageOpacity(),
            'darkHeroImageOpacity' => $store->getDarkHeroImageOpacity(),
            'heroImagePosition' => $store->getHeroImagePosition(),
            'heroImagePositionX' => $store->getHeroImagePositionX(),
            'darkHeroImagePosition' => $store->getDarkHeroImagePosition(),
            'darkHeroImagePositionX' => $store->getDarkHeroImagePositionX(),
            'heroImagePositionMobileX' => $store->getHeroImagePositionMobileX(),
            'heroImagePositionMobileY' => $store->getHeroImagePositionMobileY(),
            'heroHeading' => $store->getHeroHeading(),
            'heroSubheading' => $store->getHeroSubheading(),
            'tagline' => $store->getTagline(),
            'cardDisplayStyle' => $store->getCardDisplayStyle(),
            'heroLayout' => $store->getHeroLayout(),
            'darkColors' => $store->getDarkColors(),
            'tradeRates' => $store->getTradeRates(),
            'hoursText' => $store->getHoursText(),
            'contactEmail' => $store->getContactEmail(),
            'websiteUrl' => $store->getWebsiteUrl(),
            'facebookUrl' => $store->getFacebookUrl(),
            'instagramUrl' => $store->getInstagramUrl(),
            'twitterUrl' => $store->getTwitterUrl(),
            'discordUrl' => $store->getDiscordUrl(),
            'communityEvents' => $store->getCommunityEvents(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function cleanCommunityEvents(mixed $raw): ?array
    {
        if (null === $raw || [] === $raw) {
            return null;
        }
        if (!is_array($raw)) {
            throw new \InvalidArgumentException('communityEvents must be an object.');
        }

        $clean = [];
        $heading = $this->stringValue($raw['boardHeading'] ?? '');
        if ('' !== $heading) {
            $clean['boardHeading'] = mb_substr($heading, 0, 120);
        }
        $intro = $this->stringValue($raw['boardIntro'] ?? '');
        if ('' !== $intro) {
            $clean['boardIntro'] = mb_substr($intro, 0, 500);
        }
        $calendarUrl = $this->stringValue($raw['calendarUrl'] ?? '');
        if ('' !== $calendarUrl) {
            if (1 !== preg_match(self::URL, $calendarUrl)) {
                throw new \InvalidArgumentException('communityEvents.calendarUrl must be an http(s) URL or a path starting with "/".');
            }
            $clean['calendarUrl'] = mb_substr($calendarUrl, 0, self::URL_MAX);
        }

        $items = $raw['items'] ?? [];
        if (!is_array($items)) {
            throw new \InvalidArgumentException('communityEvents.items must be an array.');
        }
        if (count($items) > 50) {
            throw new \InvalidArgumentException('communityEvents.items cannot exceed 50 events.');
        }

        $cleanItems = [];
        foreach ($items as $index => $item) {
            if (!is_array($item)) {
                throw new \InvalidArgumentException(sprintf('communityEvents.items[%d] must be an object.', $index));
            }
            $title = $this->stringValue($item['title'] ?? '');
            if ('' === $title) {
                continue;
            }
            $startsAt = $this->stringValue($item['startsAt'] ?? '');
            if ('' === $startsAt) {
                throw new \InvalidArgumentException(sprintf('communityEvents.items[%d].startsAt is required.', $index));
            }
            try {
                new \DateTimeImmutable($startsAt);
            } catch (\Exception) {
                throw new \InvalidArgumentException(sprintf('communityEvents.items[%d].startsAt must be a valid date/time.', $index));
            }
            $row = [
                'id' => mb_substr($this->stringValue($item['id'] ?? bin2hex(random_bytes(8))), 0, 64),
                'title' => mb_substr($title, 0, 160),
                'startsAt' => $startsAt,
            ];
            $description = $this->stringValue($item['description'] ?? '');
            if ('' !== $description) {
                $row['description'] = mb_substr($description, 0, 500);
            }
            $location = $this->stringValue($item['location'] ?? '');
            if ('' !== $location) {
                $row['location'] = mb_substr($location, 0, 160);
            }
            $externalUrl = $this->stringValue($item['externalUrl'] ?? '');
            if ('' !== $externalUrl) {
                if (1 !== preg_match(self::URL, $externalUrl)) {
                    throw new \InvalidArgumentException(sprintf('communityEvents.items[%d].externalUrl must be http(s) or a / path.', $index));
                }
                $row['externalUrl'] = mb_substr($externalUrl, 0, self::URL_MAX);
            }
            if (!empty($item['pinned'])) {
                $row['pinned'] = true;
            }
            $cleanItems[] = $row;
        }

        if ([] !== $cleanItems) {
            $clean['items'] = $cleanItems;
        }

        return [] === $clean ? null : $clean;
    }

    /**
     * Validate the sell/trade rate settings: percentages must be whole
     * numbers 0–100, promo dates must be valid ISO dates in a coherent
     * window. All-empty payload clears the column (platform defaults).
     *
     * @return array<string, mixed>|null
     */
    private function cleanTradeRates(mixed $raw): ?array
    {
        if (null === $raw || [] === $raw) {
            return null;
        }
        if (!is_array($raw)) {
            throw new \InvalidArgumentException('tradeRates must be an object.');
        }

        $clean = [];
        $percentKeys = [
            'creditRatePercent', 'cashRatePercent',
            'buylistCreditRatePercent', 'buylistCashRatePercent',
            'promoCreditRatePercent', 'promoCashRatePercent',
        ];
        foreach ($percentKeys as $key) {
            $value = $raw[$key] ?? null;
            if (null === $value || '' === $value) {
                continue;
            }
            if (!is_numeric($value) || (int) $value < 0 || (int) $value > 100) {
                throw new \InvalidArgumentException(sprintf('tradeRates.%s must be a whole number between 0 and 100.', $key));
            }
            $clean[$key] = (int) $value;
        }

        $dates = [];
        foreach (['promoStartsAt', 'promoEndsAt'] as $key) {
            $value = $this->stringValue($raw[$key] ?? '');
            if ('' === $value) {
                continue;
            }
            try {
                $dates[$key] = new \DateTimeImmutable($value);
            } catch (\Exception) {
                throw new \InvalidArgumentException(sprintf('tradeRates.%s must be a valid date.', $key));
            }
            $clean[$key] = $dates[$key]->format(DATE_ATOM);
        }
        if (isset($dates['promoStartsAt'], $dates['promoEndsAt']) && $dates['promoEndsAt'] <= $dates['promoStartsAt']) {
            throw new \InvalidArgumentException('tradeRates.promoEndsAt must be after promoStartsAt.');
        }

        return [] === $clean ? null : $clean;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function cleanFrameStyles(mixed $raw): ?array
    {
        if (null === $raw || [] === $raw) {
            return null;
        }
        if (!is_array($raw)) {
            throw new \InvalidArgumentException('frameStyles must be an object.');
        }

        $keys = ['hero', 'tile', 'card'];
        $clean = [];
        foreach ($keys as $frame) {
            $piece = $raw[$frame] ?? null;
            if (null === $piece || [] === $piece) {
                continue;
            }
            if (!is_array($piece)) {
                throw new \InvalidArgumentException(sprintf('frameStyles.%s must be an object.', $frame));
            }
            $row = [];
            if (array_key_exists('borderThickness', $piece)) {
                $row['borderThickness'] = $this->intInRange($piece['borderThickness'], 'frameStyles.'.$frame.'.borderThickness', 0, 8);
            }
            if (array_key_exists('borderGlow', $piece)) {
                $row['borderGlow'] = $this->intInRange($piece['borderGlow'], 'frameStyles.'.$frame.'.borderGlow', 0, 40);
            }
            if (array_key_exists('surfaceBlur', $piece)) {
                $row['surfaceBlur'] = $this->intInRange($piece['surfaceBlur'], 'frameStyles.'.$frame.'.surfaceBlur', 0, 40);
            }
            if ([] !== $row) {
                $clean[$frame] = $row;
            }
        }

        return [] === $clean ? null : $clean;
    }

    /** @return array<string, mixed>|null */
    private function cleanPageBackgrounds(mixed $raw): ?array
    {
        if (null === $raw || [] === $raw) {
            return null;
        }
        if (!is_array($raw)) {
            throw new \InvalidArgumentException('pageBackgrounds must be an object.');
        }

        $presets = [
            // Keep in sync with frontend PAGE_BACKGROUND_PRESETS in pageBackgrounds.ts
            'none', 'noise', 'waves', 'aurora', 'grid', 'animated-grid',
            'interactive-grid',
        ];

        $light = $this->stringValue($raw['light'] ?? 'none');
        if (!in_array($light, $presets, true)) {
            throw new \InvalidArgumentException('pageBackgrounds.light is not a supported background preset.');
        }

        $clean = ['light' => $light];

        if (array_key_exists('dark', $raw)) {
            $darkRaw = $raw['dark'];
            if (null === $darkRaw || '' === $this->stringValue($darkRaw)) {
                $clean['dark'] = null;
            } else {
                $dark = $this->stringValue($darkRaw);
                if (!in_array($dark, $presets, true)) {
                    throw new \InvalidArgumentException('pageBackgrounds.dark is not a supported background preset.');
                }
                $clean['dark'] = $dark;
            }
        }

        if (array_key_exists('opacity', $raw)) {
            $clean['opacity'] = $this->intInRange($raw['opacity'], 'pageBackgrounds.opacity', 0, 100);
        }

        if (array_key_exists('colors', $raw)) {
            $colors = $this->cleanPageBackgroundColors($raw['colors']);
            if (null !== $colors) {
                $clean['colors'] = $colors;
            }
        }

        return $clean;
    }

    /** @return array<string, mixed>|null */
    private function normalizePageBackgroundsForRead(?array $raw): ?array
    {
        if (null === $raw) {
            return null;
        }

        $deprecated = ['dot', 'light-rays', 'striped', 'ripple', 'hexagon'];
        $normalizePreset = static function (mixed $value) use ($deprecated): string {
            $preset = is_string($value) ? trim($value) : 'none';
            if (in_array($preset, $deprecated, true)) {
                return 'none';
            }

            return $preset;
        };

        $light = $normalizePreset($raw['light'] ?? 'none');
        $clean = ['light' => $light];

        if (array_key_exists('dark', $raw)) {
            $darkRaw = $raw['dark'];
            if (null === $darkRaw || '' === $this->stringValue($darkRaw)) {
                $clean['dark'] = null;
            } else {
                $clean['dark'] = $normalizePreset($darkRaw);
            }
        }

        if (array_key_exists('opacity', $raw)) {
            $clean['opacity'] = $this->intInRange($raw['opacity'], 'pageBackgrounds.opacity', 0, 100);
        }

        if (array_key_exists('colors', $raw) && is_array($raw['colors'])) {
            $clean['colors'] = $raw['colors'];
        }

        return $clean;
    }

    /** @return array<string, mixed>|null */
    private function cleanPageBackgroundColors(mixed $raw): ?array
    {
        if (null === $raw || [] === $raw) {
            return null;
        }
        if (!is_array($raw)) {
            throw new \InvalidArgumentException('pageBackgrounds.colors must be an object.');
        }

        $clean = [];
        foreach (['light', 'dark'] as $theme) {
            if (!array_key_exists($theme, $raw)) {
                continue;
            }
            $themeRaw = $raw[$theme];
            if (null === $themeRaw || [] === $themeRaw) {
                continue;
            }
            if (!is_array($themeRaw)) {
                throw new \InvalidArgumentException('pageBackgrounds.colors.'.$theme.' must be an object.');
            }
            $themeClean = [];
            foreach (['primary', 'secondary', 'base'] as $key) {
                if (!array_key_exists($key, $themeRaw)) {
                    continue;
                }
                $hex = $this->normalizeHexColor($themeRaw[$key], 'pageBackgrounds.colors.'.$theme.'.'.$key);
                if ('' !== $hex) {
                    $themeClean[$key] = $hex;
                }
            }
            if ([] !== $themeClean) {
                $clean[$theme] = $themeClean;
            }
        }

        return [] === $clean ? null : $clean;
    }

    private function normalizeHexColor(mixed $value, string $key): string
    {
        $hex = $this->stringValue($value);
        if ('' === $hex) {
            return '';
        }
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $hex)) {
            throw new \InvalidArgumentException($key.' must be a 6-digit hex color.');
        }

        return strtolower($hex);
    }

    private function stringValue(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }

    /**
     * Keep pin order, drop duplicates / ids that are not this store's listings.
     *
     * @return list<int>
     */
    private function normalizePinnedInventoryIds(Store $store, mixed $raw): array
    {
        if (!is_array($raw)) {
            throw new \InvalidArgumentException('spotlightPinnedInventoryIds must be a list of inventory ids.');
        }

        $ids = [];
        foreach ($raw as $value) {
            if (is_int($value) || (is_string($value) && is_numeric(trim($value)))) {
                $n = (int) $value;
                if ($n > 0) {
                    $ids[] = $n;
                }
            }
        }
        $ids = array_values(array_unique($ids));
        if (count($ids) > self::SPOTLIGHT_ITEMS_CAP) {
            throw new \InvalidArgumentException(sprintf('You can pin at most %d spotlight cards.', self::SPOTLIGHT_ITEMS_CAP));
        }
        if ([] === $ids) {
            return [];
        }

        $owned = $this->entityManager->getRepository(InventoryItem::class)->findByStoreAndIds($store, $ids);
        $ownedIds = [];
        foreach ($owned as $item) {
            $id = $item->getId();
            if (null !== $id) {
                $ownedIds[] = $id;
            }
        }

        return $ownedIds;
    }

    private function intInRange(mixed $value, string $key, int $min, int $max): int
    {
        if (is_int($value)) {
            $n = $value;
        } elseif (is_float($value) && $value == (int) $value) {
            $n = (int) $value;
        } elseif (is_string($value) && is_numeric(trim($value)) && (float) $value == (int) $value) {
            $n = (int) $value;
        } else {
            throw new \InvalidArgumentException(sprintf('%s must be a whole number between %d and %d.', $key, $min, $max));
        }

        if ($n < $min || $n > $max) {
            throw new \InvalidArgumentException(sprintf('%s must be a whole number between %d and %d.', $key, $min, $max));
        }

        return $n;
    }
}
