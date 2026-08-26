<?php

namespace App\Service\Payments;

/**
 * Platform subscription billing — the store owner paying the platform.
 *
 * Extracted so renewals, dunning and onboarding can be tested against declines
 * without reaching Square. {@see SubscriptionBillingClient} is the real one.
 */
interface SubscriptionBillingInterface
{
    /** Methods the Web Payments SDK tokenizes for us. */
    public const METHODS = ['card', 'apple_pay', 'google_pay', 'paypal'];

    public function isLive(): bool;

    public function environment(): string;

    /** @return array{mode: string, environment: string, applicationId: string, locationId: string, methods: list<string>, currency: string, countryCode: string} */
    public function clientConfig(): array;

    /**
     * @param array{email?: string, name?: string, reference?: string} $buyer
     *
     * @return array{reference: string, customerId: string|null, cardId: string|null, last4: string|null, brand: string|null, status: string}
     *
     * @throws \RuntimeException when Square declines or is misconfigured
     */
    public function startSubscription(string $sourceId, int $priceCents, array $buyer = [], ?string $verificationToken = null): array;

    /** @return array{cardId: string, last4: string|null, brand: string|null} */
    public function replaceVaultedCard(string $customerId, ?string $previousCardId, string $sourceId, ?string $verificationToken = null): array;

    /**
     * @param string|null $idempotencyKey caller-supplied so a retry cannot capture twice
     *
     * @return array{reference: string, status: string}
     */
    public function chargeVaultedCard(string $customerId, string $cardId, int $priceCents, ?string $idempotencyKey = null): array;

    /**
     * Vault a shopper payment method on the platform merchant (marketplace wallet).
     *
     * @param array{email?: string, name?: string, reference?: string} $buyer
     *
     * @return array{customerId: string, cardId: string, last4: string|null, brand: string|null, expMonth: string|null, expYear: string|null}
     */
    public function vaultShopperPaymentMethod(
        string $sourceId,
        array $buyer = [],
        ?string $existingCustomerId = null,
        ?string $previousCardId = null,
        ?string $verificationToken = null,
    ): array;
}
