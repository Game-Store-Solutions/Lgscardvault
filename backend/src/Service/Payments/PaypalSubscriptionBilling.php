<?php

namespace App\Service\Payments;

/**
 * Platform SaaS billing on the platform PayPal account (owner → marketplace).
 *
 * First period captures a shopper-approved PayPal order id. Renewals charge a
 * vaulted PayPal payment token when PayPal returned one on capture.
 */
final class PaypalSubscriptionBilling
{
    public function __construct(
        private readonly PaypalClient $client,
        private readonly PaypalCredentials $credentials,
    ) {
    }

    public function isLive(): bool
    {
        return $this->credentials->isConfigured();
    }

    /**
     * @return array{enabled: bool, clientId: string, environment: string, currency: string}
     */
    public function clientConfig(): array
    {
        return [
            'enabled' => $this->isLive(),
            'clientId' => $this->credentials->clientId(),
            'environment' => $this->credentials->environment(),
            'currency' => $this->credentials->currency(),
        ];
    }

    public function createOrder(int $priceCents, ?string $reference = null, ?string $buyerEmail = null): string
    {
        if (!$this->isLive()) {
            return 'MOCK-PAYPAL-ORDER-'.strtoupper(bin2hex(random_bytes(4)));
        }

        $payload = [
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'reference_id' => mb_substr($reference ?? 'subscription', 0, 256),
                'amount' => [
                    'currency_code' => $this->credentials->currency(),
                    'value' => number_format(max(0, $priceCents) / 100, 2, '.', ''),
                ],
            ]],
            'payment_source' => [
                'paypal' => [
                    'experience_context' => [
                        'user_action' => 'PAY_NOW',
                    ],
                    'attributes' => [
                        'vault' => [
                            'store_in_vault' => 'ON_SUCCESS',
                            'usage_type' => 'MERCHANT',
                        ],
                    ],
                ],
            ],
        ];
        if (null !== $buyerEmail && '' !== $buyerEmail) {
            $payload['payment_source']['paypal']['email_address'] = $buyerEmail;
        }

        $data = $this->client->request('POST', '/v2/checkout/orders', $payload, ($reference ?? 'sub').'-create');
        $id = (string) ($data['id'] ?? '');
        if ('' === $id) {
            throw new \RuntimeException('PayPal did not return an order id.');
        }

        return $id;
    }

    /**
     * @param array{email?: string, name?: string, reference?: string} $buyer
     *
     * @return array{reference: string, customerId: string|null, cardId: string|null, last4: string|null, brand: string|null, status: string}
     */
    public function startSubscription(string $orderId, int $priceCents, array $buyer = []): array
    {
        if (0 === $priceCents) {
            return [
                'reference' => 'free',
                'customerId' => null,
                'cardId' => null,
                'last4' => null,
                'brand' => null,
                'status' => 'active',
            ];
        }

        if (!$this->isLive()) {
            return [
                'reference' => 'mock-paypal-'.bin2hex(random_bytes(8)),
                'customerId' => 'mock-paypal-payer',
                'cardId' => 'mock-paypal-vault',
                'last4' => null,
                'brand' => 'PAYPAL',
                'status' => 'active',
            ];
        }

        $captured = $this->client->request(
            'POST',
            '/v2/checkout/orders/'.rawurlencode($orderId).'/capture',
            [],
            ($buyer['reference'] ?? 'sub').'-start',
        );
        $capture = $captured['purchase_units'][0]['payments']['captures'][0] ?? null;
        $captureId = is_array($capture) ? (string) ($capture['id'] ?? '') : '';
        if ('' === $captureId) {
            throw new \RuntimeException('PayPal could not complete the subscription payment.');
        }

        $payerId = (string) ($captured['payer']['payer_id'] ?? $captured['payment_source']['paypal']['account_id'] ?? 'paypal');
        $vaultId = $this->vaultIdFromCapture($captured, is_array($capture) ? $capture : []);

        return [
            'reference' => $captureId,
            'customerId' => $payerId,
            'cardId' => $vaultId ?? $captureId,
            'last4' => null,
            'brand' => 'PAYPAL',
            'status' => 'active',
        ];
    }

    /**
     * @return array{cardId: string, last4: string|null, brand: string|null}
     */
    public function replaceVaultedCard(string $customerId, ?string $previousCardId, string $orderId, ?string $verificationToken = null): array
    {
        $started = $this->startSubscription($orderId, 1, ['reference' => $customerId.'-replace']);

        return [
            'cardId' => (string) ($started['cardId'] ?? $orderId),
            'last4' => $started['last4'],
            'brand' => $started['brand'] ?? 'PAYPAL',
        ];
    }

    /**
     * @return array{reference: string, status: string}
     */
    public function chargeVaultedCard(string $customerId, string $cardId, int $priceCents, ?string $idempotencyKey = null): array
    {
        if (0 === $priceCents) {
            return ['reference' => 'free', 'status' => 'active'];
        }

        if (!$this->isLive()) {
            return ['reference' => 'mock-paypal-renewal-'.bin2hex(random_bytes(8)), 'status' => 'active'];
        }

        $order = $this->client->request('POST', '/v2/checkout/orders', [
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'amount' => [
                    'currency_code' => $this->credentials->currency(),
                    'value' => number_format($priceCents / 100, 2, '.', ''),
                ],
            ]],
            'payment_source' => [
                'paypal' => [
                    'vault_id' => $cardId,
                    'stored_credential' => [
                        'payment_initiator' => 'MERCHANT',
                        'usage' => 'SUBSEQUENT',
                    ],
                ],
            ],
        ], $idempotencyKey ?? ('sub-'.bin2hex(random_bytes(6))));

        $captureId = (string) ($order['purchase_units'][0]['payments']['captures'][0]['id'] ?? $order['id'] ?? '');
        if ('' === $captureId) {
            throw new \RuntimeException('PayPal could not renew this subscription. The owner needs to reconnect PayPal.');
        }

        return ['reference' => $captureId, 'status' => 'active'];
    }

    /** @param array<string, mixed> $captured */
    private function vaultIdFromCapture(array $captured, array $capture): ?string
    {
        $vault = $captured['payment_source']['paypal']['attributes']['vault']['id']
            ?? $capture['paypal']['attributes']['vault']['id']
            ?? null;

        return is_string($vault) && '' !== $vault ? $vault : null;
    }
}
