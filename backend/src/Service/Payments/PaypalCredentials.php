<?php

namespace App\Service\Payments;

/**
 * Resolves PayPal REST credentials for the active environment.
 *
 * Sandbox and live keys live side by side (`PAYPAL_SANDBOX_*` / `PAYPAL_LIVE_*`);
 * `PAYPAL_ENVIRONMENT` selects the pair — the same pattern as Square.
 */
final class PaypalCredentials
{
    public const SANDBOX = 'sandbox';
    public const LIVE = 'live';

    public function environment(): string
    {
        return self::LIVE === strtolower($this->env('PAYPAL_ENVIRONMENT'))
            ? self::LIVE
            : self::SANDBOX;
    }

    public function isLive(): bool
    {
        return self::LIVE === $this->environment();
    }

    public function clientId(?string $environment = null): string
    {
        return $this->scoped('CLIENT_ID', $environment);
    }

    public function clientSecret(?string $environment = null): string
    {
        return $this->scoped('CLIENT_SECRET', $environment);
    }

    public function partnerAttributionId(?string $environment = null): string
    {
        return $this->scoped('BN_CODE', $environment) ?: $this->scoped('PARTNER_ATTRIBUTION_ID', $environment);
    }

    public function webhookId(?string $environment = null): string
    {
        return $this->scoped('WEBHOOK_ID', $environment);
    }

    /** Platform merchant id that receives usage-plan fees on connected seller checkouts. */
    public function partnerMerchantId(?string $environment = null): string
    {
        return $this->scoped('PARTNER_MERCHANT_ID', $environment);
    }

    public function hasPartnerMerchantId(?string $environment = null): bool
    {
        return '' !== $this->partnerMerchantId($environment);
    }

    public function apiBaseUrl(?string $environment = null): string
    {
        return self::LIVE === $this->normalize($environment)
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
    }

    public function jsSdkBaseUrl(?string $environment = null): string
    {
        return self::LIVE === $this->normalize($environment)
            ? 'https://www.paypal.com'
            : 'https://www.sandbox.paypal.com';
    }

    public function currency(): string
    {
        return strtoupper($this->env('PAYPAL_CURRENCY') ?: 'USD');
    }

    /** @return list<string> */
    public function envKeys(): array
    {
        $prefix = 'PAYPAL_'.strtoupper($this->environment()).'_';

        return [$prefix.'CLIENT_ID', $prefix.'CLIENT_SECRET', $prefix.'PARTNER_MERCHANT_ID'];
    }

    public function isConfigured(?string $environment = null): bool
    {
        return '' !== $this->clientId($environment) && '' !== $this->clientSecret($environment);
    }

    private function scoped(string $suffix, ?string $environment = null): string
    {
        $normalized = $this->normalize($environment);
        $prefix = self::LIVE === $normalized ? 'PAYPAL_LIVE_' : 'PAYPAL_SANDBOX_';

        return $this->env($prefix.$suffix);
    }

    private function normalize(?string $environment): string
    {
        if (null === $environment) {
            return $this->environment();
        }

        $value = strtolower(trim($environment));

        return self::LIVE === $value || 'production' === $value ? self::LIVE : self::SANDBOX;
    }

    private function env(string $key): string
    {
        return trim((string) ($_ENV[$key] ?? $_SERVER[$key] ?? ''));
    }
}
