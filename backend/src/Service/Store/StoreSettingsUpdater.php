<?php

namespace App\Service\Store;

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
    }

    /** @return array<string, mixed> */
    public function serialize(Store $store): array
    {
        return [
            'id' => $store->getId(),
            'name' => $store->getName(),
            'slug' => $store->getSlug(),
            'spotlightMinPriceCents' => $store->getSpotlightMinPriceCents(),
            'primaryColor' => $store->getPrimaryColor(),
            'accentColor' => $store->getAccentColor(),
            'backgroundColor' => $store->getBackgroundColor(),
            'surfaceColor' => $store->getSurfaceColor(),
            'textColor' => $store->getTextColor(),
            'mutedColor' => $store->getMutedColor(),
            'borderColor' => $store->getBorderColor(),
            'logoUrl' => $store->getLogoUrl(),
            'heroImageUrl' => $store->getHeroImageUrl(),
            'heroHeading' => $store->getHeroHeading(),
            'heroSubheading' => $store->getHeroSubheading(),
            'tagline' => $store->getTagline(),
            'cardDisplayStyle' => $store->getCardDisplayStyle(),
            'hoursText' => $store->getHoursText(),
            'contactEmail' => $store->getContactEmail(),
            'websiteUrl' => $store->getWebsiteUrl(),
            'facebookUrl' => $store->getFacebookUrl(),
            'instagramUrl' => $store->getInstagramUrl(),
            'twitterUrl' => $store->getTwitterUrl(),
            'discordUrl' => $store->getDiscordUrl(),
        ];
    }

    private function stringValue(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }
}
