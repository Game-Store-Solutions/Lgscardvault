<?php

namespace App\Service\Payments;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Platform subscription billing — the store OWNER paying the PLATFORM for a tier.
 *
 * Distinct from {@see SquareOAuthClient}, which lets a store charge its own
 * shoppers through the store's connected Square account. Here the platform is
 * the merchant, so we authenticate with the platform's own access token and
 * location rather than an OAuth token.
 *
 * The buyer tokenizes with the Web Payments SDK (card, Apple Pay, Google Pay),
 * we vault the result as a Square customer + card on file, then charge that
 * card for the first month and every renewal — no buyer present required.
 *
 * With no credentials configured we run in "mock" mode so the onboarding
 * wizard stays exercisable offline.
 */
final class SubscriptionBillingClient implements SubscriptionBillingInterface
{
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly SquareCredentials $credentials,
    ) {
    }

    public function isLive(): bool
    {
        return '' !== $this->accessToken()
            && '' !== $this->locationId()
            && '' !== $this->applicationId();
    }

    public function environment(): string
    {
        return $this->credentials->environment();
    }

    /**
     * Everything the browser SDK needs to render payment inputs. Contains no
     * secrets: the application id and location id are public by design.
     *
     * @return array{mode: string, environment: string, applicationId: string, locationId: string, methods: list<string>, currency: string, countryCode: string}
     */
    public function clientConfig(): array
    {
        return [
            'mode' => $this->isLive() ? 'square' : 'mock',
            'environment' => $this->environment(),
            'applicationId' => $this->applicationId(),
            'locationId' => $this->locationId(),
            'methods' => self::METHODS,
            'currency' => $this->currency(),
            'countryCode' => $this->countryCode(),
        ];
    }

    /**
     * Vault the tokenized method and charge the first period.
     *
     * @param array{email?: string, name?: string, reference?: string} $buyer
     *
     * @return array{reference: string, customerId: string|null, cardId: string|null, last4: string|null, brand: string|null, status: string}
     *
     * @throws \RuntimeException when Square declines or is misconfigured
     */
    public function startSubscription(
        string $sourceId,
        int $priceCents,
        array $buyer = [],
        ?string $verificationToken = null,
    ): array {
        if (0 === $priceCents) {
            return $this->freeResult();
        }

        if (!$this->isLive()) {
            return [
                'reference' => 'mock-payment-'.bin2hex(random_bytes(8)),
                'customerId' => 'mock-customer-'.bin2hex(random_bytes(4)),
                'cardId' => 'mock-card-'.bin2hex(random_bytes(4)),
                'last4' => '1111',
                'brand' => 'VISA',
                'status' => 'active',
            ];
        }

        $customerId = $this->createCustomer($buyer);
        $card = $this->createCard($customerId, $sourceId, $verificationToken);
        $payment = $this->createPayment($customerId, $card['id'], $priceCents, $verificationToken);

        return [
            'reference' => $payment,
            'customerId' => $customerId,
            'cardId' => $card['id'],
            'last4' => $card['last4'],
            'brand' => $card['brand'],
            'status' => 'active',
        ];
    }

    /**
     * Vault a replacement card and disable the previous one.
     *
     * @return array{cardId: string, last4: string|null, brand: string|null}
     */
    public function replaceVaultedCard(
        string $customerId,
        ?string $previousCardId,
        string $sourceId,
        ?string $verificationToken = null,
    ): array {
        if (!$this->isLive()) {
            return ['cardId' => 'mock-card-'.bin2hex(random_bytes(4)), 'last4' => '4242', 'brand' => 'VISA'];
        }

        $card = $this->createCard($customerId, $sourceId, $verificationToken);

        // Only retire the old card once the replacement is safely on file.
        if (null !== $previousCardId && '' !== $previousCardId && $previousCardId !== $card['id']) {
            try {
                $this->request('POST', '/v2/cards/'.rawurlencode($previousCardId).'/disable');
            } catch (\RuntimeException) {
                // A stale card left enabled is harmless; the new one is default.
            }
        }

        return $card;
    }

    /**
     * Charge a vaulted card for a renewal (no buyer present).
     *
     * Callers driving recurring billing should pass their own
     * $idempotencyKey — derived from the store and billing period — so that a
     * retry or an overlapping run cannot capture the money twice.
     *
     * @return array{reference: string, status: string}
     */
    public function chargeVaultedCard(string $customerId, string $cardId, int $priceCents, ?string $idempotencyKey = null): array
    {
        if (0 === $priceCents) {
            return ['reference' => 'free', 'status' => 'active'];
        }

        if (!$this->isLive()) {
            return ['reference' => 'mock-renewal-'.bin2hex(random_bytes(8)), 'status' => 'active'];
        }

        return [
            'reference' => $this->createPayment($customerId, $cardId, $priceCents, null, $idempotencyKey),
            'status' => 'active',
        ];
    }

    /** @return array{reference: string, customerId: null, cardId: null, last4: null, brand: null, status: string} */
    private function freeResult(): array
    {
        return [
            'reference' => 'free',
            'customerId' => null,
            'cardId' => null,
            'last4' => null,
            'brand' => null,
            'status' => 'active',
        ];
    }

    /** @param array{email?: string, name?: string, reference?: string} $buyer */
    private function createCustomer(array $buyer): string
    {
        $payload = array_filter([
            'idempotency_key' => $this->idempotencyKey(),
            'email_address' => $buyer['email'] ?? null,
            'given_name' => $buyer['name'] ?? null,
            'reference_id' => $buyer['reference'] ?? null,
        ], static fn (?string $value): bool => null !== $value && '' !== $value);

        $response = $this->request('POST', '/v2/customers', $payload);
        $id = $response['customer']['id'] ?? null;

        if (!is_string($id) || '' === $id) {
            throw new \RuntimeException('Square did not return a customer record.');
        }

        return $id;
    }

    /** @return array{id: string, cardId: string, last4: string|null, brand: string|null} */
    private function createCard(string $customerId, string $sourceId, ?string $verificationToken): array
    {
        $payload = [
            'idempotency_key' => $this->idempotencyKey(),
            'source_id' => $sourceId,
            'card' => ['customer_id' => $customerId],
        ];
        if (null !== $verificationToken && '' !== $verificationToken) {
            $payload['verification_token'] = $verificationToken;
        }

        $response = $this->request('POST', '/v2/cards', $payload);
        $id = $response['card']['id'] ?? null;

        if (!is_string($id) || '' === $id) {
            throw new \RuntimeException('Square did not return a saved card.');
        }

        return [
            'id' => $id,
            'cardId' => $id,
            'last4' => isset($response['card']['last_4']) ? (string) $response['card']['last_4'] : null,
            'brand' => isset($response['card']['card_brand']) ? (string) $response['card']['card_brand'] : null,
        ];
    }

    private function createPayment(string $customerId, string $sourceId, int $priceCents, ?string $verificationToken, ?string $idempotencyKey = null): string
    {
        $payload = [
            'idempotency_key' => $idempotencyKey ?? $this->idempotencyKey(),
            'source_id' => $sourceId,
            'customer_id' => $customerId,
            'location_id' => $this->locationId(),
            'autocomplete' => true,
            'amount_money' => [
                'amount' => $priceCents,
                'currency' => $this->currency(),
            ],
        ];
        if (null !== $verificationToken && '' !== $verificationToken) {
            $payload['verification_token'] = $verificationToken;
        }

        $response = $this->request('POST', '/v2/payments', $payload);
        $id = $response['payment']['id'] ?? null;

        if (!is_string($id) || '' === $id) {
            throw new \RuntimeException('Square did not return a payment record.');
        }

        return $id;
    }

    /**
     * @param array<string, mixed> $body
     *
     * @return array<string, mixed>
     */
    private function request(string $method, string $path, array $body = []): array
    {
        $options = [
            'headers' => [
                'Authorization' => 'Bearer '.$this->accessToken(),
                'Square-Version' => $this->apiVersion(),
                'Accept' => 'application/json',
            ],
        ];
        if ([] !== $body) {
            $options['json'] = $body;
        }

        try {
            $response = $this->httpClient->request($method, $this->baseUrl().$path, $options);
            $status = $response->getStatusCode();
            $decoded = json_decode($response->getContent(false), true);
        } catch (\Throwable) {
            throw new \RuntimeException('Could not reach the payment processor. Please try again.');
        }

        $payload = is_array($decoded) ? $decoded : [];

        if ($status >= 400) {
            throw new \RuntimeException($this->errorMessage($payload));
        }

        return $payload;
    }

    /**
     * Surface card/buyer problems verbatim so the owner can act on them, but
     * never leak credential or permission failures to the browser.
     *
     * @param array<string, mixed> $payload
     */
    private function errorMessage(array $payload): string
    {
        $error = is_array($payload['errors'][0] ?? null) ? $payload['errors'][0] : [];
        $category = (string) ($error['category'] ?? '');
        $detail = trim((string) ($error['detail'] ?? ''));

        $buyerFacing = in_array($category, ['PAYMENT_METHOD_ERROR', 'REFUND_ERROR', 'INVALID_REQUEST_ERROR'], true);

        if ($buyerFacing && '' !== $detail) {
            return $detail;
        }

        return 'The payment could not be processed. Please try again or contact support.';
    }

    private function baseUrl(): string
    {
        return $this->credentials->apiBaseUrl();
    }

    private function idempotencyKey(): string
    {
        return bin2hex(random_bytes(16));
    }

    private function apiVersion(): string
    {
        return $this->credentials->apiVersion();
    }

    private function applicationId(): string
    {
        return $this->credentials->applicationId();
    }

    private function accessToken(): string
    {
        return $this->credentials->platformAccessToken();
    }

    private function locationId(): string
    {
        return $this->credentials->platformLocationId();
    }

    private function currency(): string
    {
        return $this->credentials->currency();
    }

    private function countryCode(): string
    {
        return $this->credentials->countryCode();
    }
}
