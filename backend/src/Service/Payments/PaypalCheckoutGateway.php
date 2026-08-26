<?php

namespace App\Service\Payments;

use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Service\Billing\PlatformFeeCalculator;
use App\Repository\StorePaymentAccountRepository;

/**
 * Captures shopper PayPal payments on the STORE's connected merchant account.
 * Usage-plan checkouts include a platform fee paid to the partner merchant.
 */
final class PaypalCheckoutGateway implements PaypalCheckoutGatewayInterface
{
    public function __construct(
        private readonly PaypalClient $client,
        private readonly PaypalCredentials $credentials,
        private readonly PaypalPartnerClient $partner,
        private readonly StorePaymentAccountRepository $accounts,
        private readonly PlatformFeeCalculator $platformFees,
    ) {
    }

    public function checkoutConfig(Store $store): array
    {
        $account = $this->connectedAccount($store);
        $environment = $account?->getEnvironment() ?? $this->credentials->environment();
        $ready = $this->isReady($store);

        return [
            'enabled' => $ready,
            'clientId' => $this->credentials->clientId($environment),
            'merchantId' => (string) ($account?->getProviderMerchantId() ?? ''),
            'environment' => $environment,
            'currency' => $this->credentials->currency(),
            'message' => $ready ? null : 'PayPal checkout isn\'t available right now. Reserve your order and pay in store at pickup.',
        ];
    }

    public function isReady(Store $store): bool
    {
        if (!$this->partner->isConfigured()) {
            return false;
        }

        $account = $this->connectedAccount($store);

        return $account instanceof StorePaymentAccount && '' !== (string) $account->getProviderMerchantId();
    }

    public function createOrder(
        Store $store,
        int $amountCents,
        string $referenceId,
        array $lineItems,
        int $creditCents = 0,
        ?string $buyerEmail = null,
    ): string {
        $account = $this->requireAccount($store);
        $amount = $this->formatAmount($amountCents);
        $uniqueRef = $this->uniqueReference($referenceId);
        $platformFeeCents = $this->platformFees->feeDueForCapture($store, $amountCents);
        $purchaseUnit = [
            'reference_id' => mb_substr($uniqueRef, 0, 256),
            'invoice_id' => mb_substr($uniqueRef, 0, 127),
            'custom_id' => mb_substr($referenceId, 0, 127),
            'amount' => [
                'currency_code' => $this->credentials->currency(),
                'value' => $amount,
            ],
            'payee' => [
                'merchant_id' => $account->getProviderMerchantId(),
            ],
        ];
        if ($platformFeeCents > 0 && $this->credentials->hasPartnerMerchantId()) {
            $purchaseUnit['payment_instruction'] = [
                'platform_fees' => [[
                    'amount' => [
                        'currency_code' => $this->credentials->currency(),
                        'value' => $this->formatAmount($platformFeeCents),
                    ],
                    'payee' => [
                        'merchant_id' => $this->credentials->partnerMerchantId(),
                    ],
                ]],
            ];
        }

        $payload = [
            'intent' => 'CAPTURE',
            'purchase_units' => [$purchaseUnit],
        ];

        $data = $this->client->request('POST', '/v2/checkout/orders', $payload, $uniqueRef.'-create');
        $id = (string) ($data['id'] ?? '');
        if ('' === $id) {
            throw new \RuntimeException('PayPal did not return an order id.');
        }

        return $id;
    }

    public function charge(
        Store $store,
        int $amountCents,
        string $paypalOrderId,
        string $idempotencyKey,
        int $taxCents = 0,
    ): array {
        $this->requireAccount($store);
        if ('' === $paypalOrderId) {
            throw new \RuntimeException('A PayPal order is required.');
        }

        $existing = $this->client->request('GET', '/v2/checkout/orders/'.rawurlencode($paypalOrderId));
        $expected = $this->formatAmount($amountCents);
        $actual = (string) ($existing['purchase_units'][0]['amount']['value'] ?? '');
        if ($actual !== $expected) {
            throw new \RuntimeException('PayPal order amount does not match this cart. Refresh checkout and try again.');
        }

        $captured = $this->client->request(
            'POST',
            '/v2/checkout/orders/'.rawurlencode($paypalOrderId).'/capture',
            [],
            $idempotencyKey.'-capture',
        );

        $status = strtoupper((string) ($captured['status'] ?? ''));
        $capture = $captured['purchase_units'][0]['payments']['captures'][0] ?? null;
        $captureId = is_array($capture) ? (string) ($capture['id'] ?? '') : '';
        $captureStatus = is_array($capture) ? strtoupper((string) ($capture['status'] ?? $status)) : $status;

        if ('' === $captureId || !in_array($captureStatus, ['COMPLETED', 'PENDING'], true)) {
            throw new \RuntimeException('PayPal could not complete this payment.');
        }

        $platformFeeCents = $this->extractPlatformFeeCents($existing);

        return [
            'paymentId' => $captureId,
            'status' => $captureStatus,
            'receiptUrl' => null,
            'squareOrderId' => null,
            'taxCents' => $taxCents,
            'chargedCents' => $amountCents,
            'platformFeeCents' => $platformFeeCents,
        ];
    }

    public function refund(Store $store, string $captureId, int $amountCents, string $idempotencyKey, ?string $reason = null): array
    {
        $this->requireAccount($store);
        $payload = [
            'amount' => [
                'currency_code' => $this->credentials->currency(),
                'value' => $this->formatAmount($amountCents),
            ],
        ];
        if (null !== $reason && '' !== trim($reason)) {
            $payload['note_to_payer'] = mb_substr(trim($reason), 0, 255);
        }

        $data = $this->client->request(
            'POST',
            '/v2/payments/captures/'.rawurlencode($captureId).'/refund',
            $payload,
            $idempotencyKey,
        );

        return [
            'refundId' => (string) ($data['id'] ?? ''),
            'status' => strtoupper((string) ($data['status'] ?? 'COMPLETED')),
        ];
    }

    private function connectedAccount(Store $store): ?StorePaymentAccount
    {
        $account = $this->accounts->findOneForStoreAndProvider($store, StorePaymentAccount::PROVIDER_PAYPAL);
        if (!$account instanceof StorePaymentAccount) {
            return null;
        }
        if (StorePaymentAccount::STATUS_CONNECTED !== $account->getStatus()) {
            return null;
        }

        return $account;
    }

    private function requireAccount(Store $store): StorePaymentAccount
    {
        $account = $this->connectedAccount($store);
        if (!$account instanceof StorePaymentAccount || '' === (string) $account->getProviderMerchantId()) {
            throw new \RuntimeException('This store has not connected PayPal yet.');
        }

        return $account;
    }

    private function uniqueReference(string $hint): string
    {
        $safe = preg_replace('/[^A-Za-z0-9_-]/', '-', $hint) ?? 'order';
        $safe = trim($safe, '-') ?: 'order';

        return mb_substr($safe, 0, 80).'-'.bin2hex(random_bytes(6));
    }

    private function formatAmount(int $cents): string
    {
        return number_format(max(0, $cents) / 100, 2, '.', '');
    }

    /** @param array<string, mixed> $order */
    private function extractPlatformFeeCents(array $order): int
    {
        $units = is_array($order['purchase_units'] ?? null) ? $order['purchase_units'] : [];
        $unit = is_array($units[0] ?? null) ? $units[0] : [];
        $instruction = is_array($unit['payment_instruction'] ?? null) ? $unit['payment_instruction'] : [];
        $fees = is_array($instruction['platform_fees'] ?? null) ? $instruction['platform_fees'] : [];
        $fee = is_array($fees[0] ?? null) ? $fees[0] : [];
        $value = $fee['amount']['value'] ?? null;
        if (!is_string($value) && !is_numeric($value)) {
            return 0;
        }

        return (int) round((float) $value * 100);
    }
}
