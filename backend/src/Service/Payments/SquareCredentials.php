<?php

namespace App\Service\Payments;

/**
 * Resolves Square credentials for the active environment.
 *
 * Sandbox and production keys live side by side under distinct names
 * (`SQUARE_SANDBOX_*` / `SQUARE_PRODUCTION_*`) and `SQUARE_ENVIRONMENT` selects
 * the set. Going live is a one-variable change, and a half-finished switch
 * cannot silently send sandbox keys to the live API: each environment only ever
 * reads its own pair, so a missing production token yields mock mode rather
 * than an authentication failure against real money.
 */
final class SquareCredentials
{
    public const SANDBOX = 'sandbox';
    public const PRODUCTION = 'production';

    /** Square pins behaviour to a dated API version. */
    private const DEFAULT_API_VERSION = '2025-01-23';

    /** The environment the platform itself operates in. */
    public function environment(): string
    {
        return self::PRODUCTION === strtolower($this->env('SQUARE_ENVIRONMENT'))
            ? self::PRODUCTION
            : self::SANDBOX;
    }

    public function isProduction(): bool
    {
        return self::PRODUCTION === $this->environment();
    }

    /**
     * Public identifier used by the browser SDK and the OAuth authorize URL.
     *
     * Pass an explicit environment when acting on behalf of a connected store,
     * whose account records the environment it was linked in.
     */
    public function applicationId(?string $environment = null): string
    {
        return $this->scoped('APPLICATION_ID', $environment);
    }

    /** OAuth client secret — used to connect stores, never sent to a browser. */
    public function applicationSecret(?string $environment = null): string
    {
        return $this->scoped('APPLICATION_SECRET', $environment);
    }

    /** Platform's own access token, for billing store owners for their tier. */
    public function platformAccessToken(): string
    {
        return $this->scoped('ACCESS_TOKEN');
    }

    /** Platform's own location, required by CreatePayment. */
    public function platformLocationId(): string
    {
        return $this->scoped('LOCATION_ID');
    }

    /** Signature key from the webhook subscription, used to authenticate callbacks. */
    public function webhookSignatureKey(): string
    {
        return $this->scoped('WEBHOOK_SIGNATURE_KEY');
    }

    /**
     * The notification URL exactly as registered with Square. It is part of the
     * signed payload, so it must match character for character — including the
     * scheme and any trailing path — rather than being rebuilt from the request,
     * which a proxy could rewrite.
     */
    public function webhookUrl(): string
    {
        return $this->env('SQUARE_WEBHOOK_URL');
    }

    public function apiBaseUrl(?string $environment = null): string
    {
        return self::PRODUCTION === $this->normalize($environment)
            ? 'https://connect.squareup.com'
            : 'https://connect.squareupsandbox.com';
    }

    public function apiVersion(): string
    {
        return $this->env('SQUARE_API_VERSION') ?: self::DEFAULT_API_VERSION;
    }

    public function currency(): string
    {
        return strtoupper($this->env('SQUARE_CURRENCY') ?: 'USD');
    }

    public function countryCode(): string
    {
        return strtoupper($this->env('SQUARE_COUNTRY') ?: 'US');
    }

    /** @return list<string> Env var names for the active environment, for diagnostics. */
    public function envKeys(): array
    {
        $prefix = 'SQUARE_'.strtoupper($this->environment()).'_';

        return [$prefix.'APPLICATION_ID', $prefix.'ACCESS_TOKEN', $prefix.'LOCATION_ID'];
    }

    private function scoped(string $suffix, ?string $environment = null): string
    {
        return $this->env('SQUARE_'.strtoupper($this->normalize($environment)).'_'.$suffix);
    }

    /** Anything unrecognised falls back to sandbox — never to live money. */
    private function normalize(?string $environment): string
    {
        if (null === $environment) {
            return $this->environment();
        }

        return self::PRODUCTION === strtolower(trim($environment)) ? self::PRODUCTION : self::SANDBOX;
    }

    private function env(string $key): string
    {
        return trim((string) ($_ENV[$key] ?? $_SERVER[$key] ?? ''));
    }
}
