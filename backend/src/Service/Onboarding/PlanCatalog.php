<?php

namespace App\Service\Onboarding;

/**
 * Platform pricing for new stores. Two choices: pay $450 once, or 5% of each
 * shopper payment until $450 is reached. Legacy monthly tiers remain readable
 * for stores already on them.
 */
final class PlanCatalog
{
    public const PLATFORM_CAP_CENTS = 45000;

    public const USAGE_FEE_BPS = 500;

    private const FEATURES = [
        'Full storefront & marketplace listing',
        'Unlimited inventory & CSV import',
        'Square and PayPal shopper checkout',
        'Sell / trade portal & store credit',
        'Orders, reports, and spotlight eligibility',
        'Email support',
    ];

    /** @var list<array<string, mixed>> */
    private const CURRENT_PLANS = [
        [
            'key' => 'flat',
            'name' => 'Pay in full',
            'billingModel' => 'flat',
            'priceCents' => self::PLATFORM_CAP_CENTS,
            'capCents' => self::PLATFORM_CAP_CENTS,
            'feePercentBps' => 0,
            'requiresVault' => false,
            'tagline' => 'One $450 payment — every feature, no sales fees.',
            'popular' => true,
            'features' => self::FEATURES,
        ],
        [
            'key' => 'usage',
            'name' => 'Pay as you sell',
            'billingModel' => 'usage',
            'priceCents' => 0,
            'capCents' => self::PLATFORM_CAP_CENTS,
            'feePercentBps' => self::USAGE_FEE_BPS,
            'requiresVault' => true,
            'tagline' => '5% of each sale until $450 — then no more platform fees.',
            'features' => self::FEATURES,
        ],
    ];

    /** @var list<array<string, mixed>> */
    private const LEGACY_PLANS = [
        [
            'key' => 'starter',
            'name' => 'Starter',
            'billingModel' => 'legacy_monthly',
            'priceCents' => 0,
            'capCents' => 0,
            'feePercentBps' => 0,
            'requiresVault' => false,
            'tagline' => 'Legacy free tier.',
            'features' => ['Legacy plan'],
        ],
        [
            'key' => 'pro',
            'name' => 'Pro',
            'billingModel' => 'legacy_monthly',
            'priceCents' => 4900,
            'capCents' => 0,
            'feePercentBps' => 0,
            'requiresVault' => false,
            'tagline' => 'Legacy monthly plan.',
            'features' => ['Legacy plan'],
        ],
        [
            'key' => 'enterprise',
            'name' => 'Enterprise',
            'billingModel' => 'legacy_monthly',
            'priceCents' => 19900,
            'capCents' => 0,
            'feePercentBps' => 0,
            'requiresVault' => false,
            'tagline' => 'Legacy monthly plan.',
            'features' => ['Legacy plan'],
        ],
    ];

    /** @return list<array<string, mixed>> */
    public function all(): array
    {
        return self::CURRENT_PLANS;
    }

    /** @return list<string> */
    public function keys(): array
    {
        return array_map(static fn (array $plan): string => (string) $plan['key'], self::CURRENT_PLANS);
    }

    /** @return array<string, mixed>|null */
    public function find(string $key): ?array
    {
        foreach ([...self::CURRENT_PLANS, ...self::LEGACY_PLANS] as $plan) {
            if ($plan['key'] === $key) {
                return $plan;
            }
        }

        return null;
    }

    public function isUsagePlan(?string $key): bool
    {
        $plan = null === $key ? null : $this->find($key);

        return is_array($plan) && 'usage' === ($plan['billingModel'] ?? '');
    }

    public function isFlatPlan(?string $key): bool
    {
        $plan = null === $key ? null : $this->find($key);

        return is_array($plan) && 'flat' === ($plan['billingModel'] ?? '');
    }

    /** Monthly SaaS renewals — only legacy tiers. */
    public function monthlyRenewalCents(?string $key): int
    {
        $plan = null === $key ? null : $this->find($key);
        if (!is_array($plan) || 'legacy_monthly' !== ($plan['billingModel'] ?? '')) {
            return 0;
        }

        return max(0, (int) ($plan['priceCents'] ?? 0));
    }

    public function requiresPaymentMethod(?string $key): bool
    {
        $plan = null === $key ? null : $this->find($key);
        if (!is_array($plan)) {
            return false;
        }

        return ((int) ($plan['priceCents'] ?? 0)) > 0 || (bool) ($plan['requiresVault'] ?? false);
    }

    public function upfrontChargeCents(?string $key): int
    {
        $plan = null === $key ? null : $this->find($key);
        if (!is_array($plan)) {
            return 0;
        }

        return max(0, (int) ($plan['priceCents'] ?? 0));
    }

    public function usageFeeBps(?string $key): int
    {
        $plan = null === $key ? null : $this->find($key);

        return max(0, (int) ($plan['feePercentBps'] ?? 0));
    }

    public function platformCapCents(?string $key): int
    {
        $plan = null === $key ? null : $this->find($key);

        return max(0, (int) ($plan['capCents'] ?? self::PLATFORM_CAP_CENTS));
    }
}
