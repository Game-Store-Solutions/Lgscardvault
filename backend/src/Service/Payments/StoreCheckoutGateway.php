<?php

namespace App\Service\Payments;

use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Repository\StorePaymentAccountRepository;
use App\Service\Billing\PlatformFeeCalculator;
use App\Service\Checkout\PickupTaxNotReadyException;
use App\Service\Checkout\PickupTaxPolicy;
use App\Service\Security\SecretCipher;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Charges a shopper through a STORE's connected Square account.
 *
 * The counterpart to {@see SubscriptionBillingClient}: there the platform is
 * the merchant, here the store is, so every call authenticates with that
 * store's OAuth access token and settles into that store's own bank account.
 * Usage-plan stores include an application fee routed to the platform.
 */
final class StoreCheckoutGateway implements CheckoutGatewayInterface
{
    /** Refresh this far ahead of expiry so a live checkout never races the clock. */
    private const REFRESH_WINDOW = '+7 days';

    /** Shown to shoppers when card checkout is disabled (owners get {@see ownerMessage}). */
    private const SHOPPER_CHECKOUT_UNAVAILABLE =
        'Online card checkout isn\'t available right now. Reserve your order and pay in store at pickup.';

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly SquareOAuthClient $oauth,
        private readonly SquareCredentials $credentials,
        private readonly StorePaymentAccountRepository $accounts,
        private readonly SecretCipher $cipher,
        private readonly EntityManagerInterface $entityManager,
        private readonly LoggerInterface $logger,
        private readonly PickupTaxPolicy $taxPolicy,
        private readonly PlatformFeeCalculator $platformFees,
    ) {
    }

    /**
     * Public Web Payments SDK configuration for a store's checkout form.
     * Returns disabled rather than throwing so the cart can render a clear
     * "this store isn't taking online payments yet" state.
     *
     * @return array{enabled: bool, message: ?string, ownerMessage: ?string, applicationId: string, locationId: string, environment: string, currency: string, countryCode: string}
     */
    public function checkoutConfig(Store $store): array
    {
        $readiness = $this->evaluateReadiness($store);
        $account = $readiness['account'];
        $environment = $account?->getEnvironment() ?? $this->credentials->environment();
        $locationId = (string) ($account?->getProviderLocationId() ?? '');

        return [
            'enabled' => $readiness['ready'],
            'message' => $readiness['message'],
            'ownerMessage' => $readiness['ownerMessage'],
            'applicationId' => $this->credentials->applicationId($environment),
            'locationId' => $locationId,
            'environment' => $environment,
            'currency' => $this->credentials->currency(),
            'countryCode' => $this->credentials->countryCode(),
        ];
    }

    public function isReady(Store $store): bool
    {
        return $this->evaluateReadiness($store)['ready'];
    }

    /**
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return array{taxCents: int, dueCents: int}
     */
    public function quotePickupTotals(Store $store, array $lineItems, int $creditCents = 0): array
    {
        $merchandiseDue = $this->merchandiseDue($lineItems, $creditCents);
        $fallback = ['taxCents' => 0, 'dueCents' => $merchandiseDue];

        if ([] === $lineItems || !$this->isReady($store)) {
            return $fallback;
        }

        $account = $this->connectedAccount($store);
        $locationId = (string) ($account?->getProviderLocationId() ?? '');
        if (null === $account || '' === $locationId) {
            return $fallback;
        }

        try {
            $response = $this->request($account, 'POST', '/v2/orders/calculate', [
                'order' => $this->squareOrderPayload(
                    $locationId,
                    $lineItems,
                    $creditCents,
                    null,
                    null,
                    null,
                    'pickup',
                ),
            ]);
        } catch (\RuntimeException $e) {
            $this->logger->warning('Square CalculateOrder failed; quoting without tax', [
                'store' => $store->getSlug(),
                'error' => $e->getMessage(),
            ]);

            return $fallback;
        }

        return $this->totalsFromSquareOrder($response['order'] ?? null, $merchandiseDue);
    }

    /**
     * @return array{ready: bool, message: string|null, ownerMessage: string|null, account: StorePaymentAccount|null}
     */
    private function evaluateReadiness(Store $store): array
    {
        if (!$this->oauth->isConfigured()) {
            return $this->notReady('Platform Square credentials are not configured.');
        }

        $existing = $this->accounts->findOneBy([
            'store' => $store,
            'provider' => StorePaymentAccount::PROVIDER_SQUARE,
        ]);
        if ($existing instanceof StorePaymentAccount && StorePaymentAccount::STATUS_ERROR === $existing->getStatus()) {
            return $this->notReady('Square rejected this store\'s credentials. Reconnect in Payments (admin).');
        }

        $account = $this->connectedAccount($store);
        if (!$account instanceof StorePaymentAccount) {
            return $this->notReady('This store has not connected Square for online checkout yet.');
        }

        $locationId = (string) ($account->getProviderLocationId() ?? '');
        if ('' === $locationId) {
            return $this->notReady('Square location is missing for this store.', $account);
        }

        try {
            $this->accessToken($account);
        } catch (\RuntimeException) {
            return $this->notReady('Square access token is missing or expired. Reconnect in Payments (admin).', $account);
        }

        if (!$this->credentialsHealthy($account)) {
            return $this->notReady('Square API probe failed. Reconnect in Payments (admin).', $account);
        }

        return ['ready' => true, 'message' => null, 'ownerMessage' => null, 'account' => $account];
    }

    /**
     * @return array{ready: false, message: string, ownerMessage: string, account: StorePaymentAccount|null}
     */
    private function notReady(string $ownerMessage, ?StorePaymentAccount $account = null): array
    {
        return [
            'ready' => false,
            'message' => self::SHOPPER_CHECKOUT_UNAVAILABLE,
            'ownerMessage' => $ownerMessage,
            'account' => $account,
        ];
    }

    private function credentialsHealthy(StorePaymentAccount $account): bool
    {
        $locationId = (string) ($account->getProviderLocationId() ?? '');
        if ('' === $locationId) {
            return false;
        }

        try {
            $this->request($account, 'GET', '/v2/locations/'.rawurlencode($locationId));

            return true;
        } catch (\RuntimeException $e) {
            $this->logger->warning('Square checkout readiness probe failed', [
                'store' => $account->getStore()?->getSlug(),
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Charge the shopper. `$idempotencyKey` must be stable for a given order so
     * a retried request can never take the money twice.
     *
     * When `$lineItems` is provided, creates an itemized Square Order (PICKUP
     * fulfillment when applicable) and links CreatePayment to that order_id.
     *
     * @param list<array{name: string, quantity: int, priceCents: int}>|null $lineItems
     *
     * @return array{paymentId: string, status: string, receiptUrl: string|null, squareOrderId: string|null, taxCents: int, chargedCents: int, platformFeeCents: int}
     *
     * @throws \RuntimeException when the store is not connected or Square declines
     */
    public function charge(
        Store $store,
        int $amountCents,
        string $sourceId,
        string $idempotencyKey,
        ?string $verificationToken = null,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
        ?string $customerId = null,
        ?array $lineItems = null,
        int $creditCents = 0,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array {
        if ($amountCents <= 0 && (null === $lineItems || [] === $lineItems)) {
            throw new \RuntimeException('There is nothing to charge.');
        }

        $account = $this->connectedAccount($store);
        if (null === $account) {
            throw new \RuntimeException('This store is not accepting online payments right now.');
        }

        $locationId = (string) $account->getProviderLocationId();
        if ('' === $locationId) {
            throw new \RuntimeException('This store has not finished its payment setup.');
        }

        $squareOrderId = null;
        $taxCents = 0;
        $chargedCents = $amountCents;
        if (null !== $lineItems && [] !== $lineItems) {
            try {
                $created = $this->createSquareOrder(
                    $account,
                    $idempotencyKey.'-order',
                    $this->squareOrderPayload(
                        $locationId,
                        $lineItems,
                        $creditCents,
                        $referenceId,
                        $buyerEmail,
                        $buyerName,
                        $fulfillment,
                    ),
                );
                $squareOrderId = $created['id'];
                $taxCents = $created['taxCents'];
                if ($created['totalCents'] > 0) {
                    $chargedCents = $created['totalCents'];
                }
            } catch (PickupTaxNotReadyException $e) {
                throw $e;
            } catch (\RuntimeException $e) {
                // Fail closed: charging merchandise only would skip location tax.
                $this->logger->warning('Square CreateOrder failed; refusing card capture', [
                    'store' => $store->getSlug(),
                    'error' => $e->getMessage(),
                ]);
                throw new \RuntimeException(
                    'Could not calculate sales tax for this order. Try again or pay in store.',
                    0,
                    $e,
                );
            }

            $taxableSubtotal = 0;
            foreach ($lineItems as $item) {
                $taxableSubtotal += max(0, (int) ($item['priceCents'] ?? 0)) * max(1, (int) ($item['quantity'] ?? 1));
            }
            $block = $this->taxPolicy->cardCheckoutBlockReason($store, $taxCents, $taxableSubtotal);
            if (null !== $block) {
                throw new PickupTaxNotReadyException($block);
            }
        }

        if ($chargedCents <= 0) {
            throw new \RuntimeException('There is nothing to charge.');
        }

        $payload = [
            'idempotency_key' => $idempotencyKey,
            'source_id' => $sourceId,
            'location_id' => $locationId,
            'autocomplete' => true,
            'amount_money' => ['amount' => $chargedCents, 'currency' => $this->credentials->currency()],
        ];
        if (null !== $squareOrderId) {
            $payload['order_id'] = $squareOrderId;
        }
        if (null !== $verificationToken && '' !== $verificationToken) {
            $payload['verification_token'] = $verificationToken;
        }
        if (null !== $referenceId && '' !== $referenceId) {
            $payload['reference_id'] = substr($referenceId, 0, 40);
        }
        if (null !== $buyerEmail && '' !== $buyerEmail) {
            $payload['buyer_email_address'] = $buyerEmail;
        }
        if (null !== $customerId && '' !== $customerId) {
            $payload['customer_id'] = $customerId;
        }

        $platformFeeCents = $this->platformFees->feeDueForCapture($store, $chargedCents);
        if ($platformFeeCents > 0) {
            $payload['app_fee_money'] = [
                'amount' => $platformFeeCents,
                'currency' => $this->credentials->currency(),
            ];
        }

        $response = $this->request($account, 'POST', '/v2/payments', $payload);
        $paymentId = $response['payment']['id'] ?? null;

        if (!is_string($paymentId) || '' === $paymentId) {
            throw new \RuntimeException('The payment could not be confirmed.');
        }

        return [
            'paymentId' => $paymentId,
            'status' => (string) ($response['payment']['status'] ?? 'UNKNOWN'),
            'receiptUrl' => isset($response['payment']['receipt_url']) ? (string) $response['payment']['receipt_url'] : null,
            'squareOrderId' => $squareOrderId,
            'taxCents' => $taxCents,
            'chargedCents' => $chargedCents,
            'platformFeeCents' => $platformFeeCents,
        ];
    }

    public function chargeVaultedCard(
        Store $store,
        int $amountCents,
        string $customerId,
        string $cardId,
        string $idempotencyKey,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
        ?array $lineItems = null,
        int $creditCents = 0,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array {
        return $this->charge(
            $store,
            $amountCents,
            $cardId,
            $idempotencyKey,
            null,
            $referenceId,
            $buyerEmail,
            $customerId,
            $lineItems,
            $creditCents,
            $buyerName,
            $fulfillment,
        );
    }

    public function createPaymentLink(
        Store $store,
        int $amountCents,
        string $idempotencyKey,
        string $referenceId,
        array $lineItems,
        int $creditCents = 0,
        ?string $buyerEmail = null,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
        ?string $paymentNote = null,
    ): array {
        if ($amountCents <= 0) {
            throw new \RuntimeException('There is nothing to charge.');
        }

        $account = $this->connectedAccount($store);
        if (null === $account) {
            throw new \RuntimeException('This store is not accepting online payments right now.');
        }

        $locationId = (string) $account->getProviderLocationId();
        if ('' === $locationId) {
            throw new \RuntimeException('This store has not finished its payment setup.');
        }

        $note = trim((string) $paymentNote);
        if ('' === $note) {
            $note = 'Paying in store — '.$referenceId;
        }

        $payload = [
            'idempotency_key' => $idempotencyKey,
            'payment_note' => mb_substr($note, 0, 500),
            'checkout_options' => [
                'ask_for_shipping_address' => false,
                'accepted_payment_methods' => [
                    'apple_pay' => true,
                    'google_pay' => true,
                    'cash_app_pay' => true,
                ],
            ],
        ];

        if ([] !== $lineItems) {
            $payload['order'] = $this->squareOrderPayload(
                $locationId,
                $lineItems,
                $creditCents,
                $referenceId,
                $buyerEmail,
                $buyerName,
                $fulfillment,
            );
        } else {
            $payload['quick_pay'] = [
                'name' => mb_substr('Order '.$referenceId, 0, 255),
                'price_money' => ['amount' => $amountCents, 'currency' => $this->credentials->currency()],
                'location_id' => $locationId,
            ];
        }

        if (null !== $buyerEmail && '' !== trim($buyerEmail)) {
            $payload['pre_populated_data'] = ['buyer_email' => trim($buyerEmail)];
        }

        $response = $this->request($account, 'POST', '/v2/online-checkout/payment-links', $payload);
        $link = is_array($response['payment_link'] ?? null) ? $response['payment_link'] : [];
        $url = trim((string) ($link['url'] ?? $link['long_url'] ?? ''));
        if ('' === $url) {
            throw new \RuntimeException('Square did not return a payment link.');
        }

        $squareOrderId = isset($link['order_id']) ? trim((string) $link['order_id']) : '';

        return [
            'url' => $url,
            'squareOrderId' => '' !== $squareOrderId ? $squareOrderId : null,
        ];
    }

    /**
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     *
     * @return array<string, mixed>
     */
    private function squareOrderPayload(
        string $locationId,
        array $lineItems,
        int $creditCents,
        ?string $referenceId,
        ?string $buyerEmail,
        ?string $buyerName,
        string $fulfillment,
    ): array {
        $currency = $this->credentials->currency();
        $squareLines = [];
        foreach ($lineItems as $i => $item) {
            $qty = max(1, (int) $item['quantity']);
            $name = trim((string) $item['name']);
            if ('' === $name) {
                $name = 'Item';
            }
            $squareLines[] = [
                'uid' => 'line-'.$i,
                'name' => mb_substr($name, 0, 512),
                'quantity' => (string) $qty,
                'base_price_money' => [
                    'amount' => max(0, (int) $item['priceCents']),
                    'currency' => $currency,
                ],
            ];
        }

        $orderPayload = [
            'location_id' => $locationId,
            'line_items' => $squareLines,
            'pricing_options' => [
                'auto_apply_taxes' => true,
            ],
        ];
        if (null !== $referenceId && '' !== $referenceId) {
            $orderPayload['reference_id'] = substr($referenceId, 0, 40);
        }
        if ($creditCents > 0) {
            $orderPayload['discounts'] = [[
                'uid' => 'store-credit',
                'name' => 'Store credit',
                'type' => 'FIXED_AMOUNT',
                'amount_money' => ['amount' => $creditCents, 'currency' => $currency],
                'scope' => 'ORDER',
            ]];
        }

        if ('pickup' === $fulfillment) {
            $recipient = array_filter([
                'display_name' => null !== $buyerName && '' !== trim($buyerName) ? mb_substr(trim($buyerName), 0, 255) : null,
                'email_address' => null !== $buyerEmail && '' !== trim($buyerEmail) ? trim($buyerEmail) : null,
            ], static fn (?string $v): bool => null !== $v && '' !== $v);

            $orderPayload['fulfillments'] = [[
                'uid' => 'pickup',
                'type' => 'PICKUP',
                'state' => 'PROPOSED',
                'pickup_details' => array_filter([
                    'schedule_type' => 'ASAP',
                    'recipient' => [] !== $recipient ? $recipient : null,
                ], static fn (mixed $v): bool => null !== $v),
            ]];
        }

        return $orderPayload;
    }

    /**
     * @param array<string, mixed> $orderPayload
     *
     * @return array{id: string, taxCents: int, totalCents: int}
     */
    private function createSquareOrder(
        StorePaymentAccount $account,
        string $idempotencyKey,
        array $orderPayload,
    ): array {
        $response = $this->request($account, 'POST', '/v2/orders', [
            'idempotency_key' => $idempotencyKey,
            'order' => $orderPayload,
        ]);

        $order = $response['order'] ?? null;
        $orderId = is_array($order) ? ($order['id'] ?? null) : null;
        if (!is_string($orderId) || '' === $orderId) {
            throw new \RuntimeException('Square did not return an order id.');
        }

        $totals = $this->totalsFromSquareOrder($order, 0);

        return [
            'id' => $orderId,
            'taxCents' => $totals['taxCents'],
            'totalCents' => $totals['dueCents'],
        ];
    }

    /**
     * @param list<array{name: string, quantity: int, priceCents: int}> $lineItems
     */
    private function merchandiseDue(array $lineItems, int $creditCents): int
    {
        $merchandise = 0;
        foreach ($lineItems as $item) {
            $merchandise += max(0, (int) $item['priceCents']) * max(1, (int) $item['quantity']);
        }

        return max(0, $merchandise - max(0, $creditCents));
    }

    /**
     * @return array{taxCents: int, dueCents: int}
     */
    private function totalsFromSquareOrder(mixed $order, int $fallbackDue): array
    {
        if (!is_array($order)) {
            return ['taxCents' => 0, 'dueCents' => $fallbackDue];
        }

        $tax = isset($order['total_tax_money']['amount']) ? (int) $order['total_tax_money']['amount'] : 0;
        $due = isset($order['total_money']['amount']) ? (int) $order['total_money']['amount'] : $fallbackDue;

        return [
            'taxCents' => max(0, $tax),
            'dueCents' => max(0, $due),
        ];
    }

    /**
     * Refund a captured payment, e.g. when staff cancel a paid order.
     *
     * @return array{refundId: string, status: string}
     */
    public function refund(Store $store, string $paymentId, int $amountCents, string $idempotencyKey, ?string $reason = null): array
    {
        $account = $this->connectedAccount($store);
        if (null === $account) {
            throw new \RuntimeException('This store is no longer connected to Square.');
        }

        $response = $this->request($account, 'POST', '/v2/refunds', array_filter([
            'idempotency_key' => $idempotencyKey,
            'payment_id' => $paymentId,
            'amount_money' => ['amount' => $amountCents, 'currency' => $this->credentials->currency()],
            'reason' => $reason,
        ], static fn (mixed $value): bool => null !== $value));

        return [
            'refundId' => (string) ($response['refund']['id'] ?? ''),
            'status' => (string) ($response['refund']['status'] ?? 'UNKNOWN'),
        ];
    }

    /**
     * @param array{email?: string, name?: string, reference?: string} $buyer
     *
     * @return array{customerId: string, cardId: string, last4: string|null, brand: string|null, expMonth: string|null, expYear: string|null}
     */
    public function vaultPaymentMethod(
        Store $store,
        string $sourceId,
        ?string $verificationToken,
        array $buyer,
        ?string $existingCustomerId,
        ?string $previousCardId,
    ): array {
        $account = $this->connectedAccount($store);
        if (null === $account) {
            throw new \RuntimeException('This store is not accepting online payments right now.');
        }

        $customerId = (null !== $existingCustomerId && '' !== $existingCustomerId)
            ? $existingCustomerId
            : $this->createCustomer($account, $buyer);

        $card = $this->createCard($account, $customerId, $sourceId, $verificationToken);

        if (null !== $previousCardId && '' !== $previousCardId && $previousCardId !== $card['cardId']) {
            try {
                $this->request($account, 'POST', '/v2/cards/'.rawurlencode($previousCardId).'/disable', []);
            } catch (\RuntimeException) {
                // A stale card left enabled is harmless; the new one is on file.
            }
        }

        return [
            'customerId' => $customerId,
            'cardId' => $card['cardId'],
            'last4' => $card['last4'],
            'brand' => $card['brand'],
            'expMonth' => $card['expMonth'],
            'expYear' => $card['expYear'],
        ];
    }

    /** @param array{email?: string, name?: string, reference?: string} $buyer */
    private function createCustomer(StorePaymentAccount $account, array $buyer): string
    {
        $payload = array_filter([
            'idempotency_key' => bin2hex(random_bytes(16)),
            'email_address' => $buyer['email'] ?? null,
            'given_name' => $buyer['name'] ?? null,
            'reference_id' => isset($buyer['reference']) ? mb_substr((string) $buyer['reference'], 0, 40) : null,
        ], static fn (?string $value): bool => null !== $value && '' !== $value);

        $response = $this->request($account, 'POST', '/v2/customers', $payload);
        $id = $response['customer']['id'] ?? null;

        if (!is_string($id) || '' === $id) {
            throw new \RuntimeException('Could not save your payment profile.');
        }

        return $id;
    }

    /**
     * @return array{cardId: string, last4: string|null, brand: string|null, expMonth: string|null, expYear: string|null}
     */
    private function createCard(
        StorePaymentAccount $account,
        string $customerId,
        string $sourceId,
        ?string $verificationToken,
    ): array {
        $payload = [
            'idempotency_key' => bin2hex(random_bytes(16)),
            'source_id' => $sourceId,
            'card' => ['customer_id' => $customerId],
        ];
        if (null !== $verificationToken && '' !== $verificationToken) {
            $payload['verification_token'] = $verificationToken;
        }

        $response = $this->request($account, 'POST', '/v2/cards', $payload);
        $id = $response['card']['id'] ?? null;

        if (!is_string($id) || '' === $id) {
            throw new \RuntimeException('Could not save your payment method.');
        }

        $expMonth = isset($response['card']['exp_month']) ? (string) $response['card']['exp_month'] : null;
        $expYear = isset($response['card']['exp_year']) ? (string) $response['card']['exp_year'] : null;

        return [
            'cardId' => $id,
            'last4' => isset($response['card']['last_4']) ? (string) $response['card']['last_4'] : null,
            'brand' => isset($response['card']['card_brand']) ? (string) $response['card']['card_brand'] : null,
            'expMonth' => $expMonth,
            'expYear' => $expYear,
        ];
    }

    /**
     * Discover and persist the merchant's location. Called right after connect,
     * and lazily afterwards so accounts linked before this existed heal
     * themselves on first use.
     */
    public function syncLocation(StorePaymentAccount $account): ?string
    {
        $existing = $account->getProviderLocationId();
        if (null !== $existing && '' !== $existing) {
            return $existing;
        }

        try {
            $locationId = $this->oauth->primaryLocationId($this->accessToken($account));
        } catch (\RuntimeException $e) {
            $this->logger->warning('Square location lookup failed', ['error' => $e->getMessage()]);

            return null;
        }

        if (null !== $locationId) {
            $account->setProviderLocationId($locationId);
            $this->entityManager->flush();
        }

        return $locationId;
    }

    private function connectedAccount(Store $store): ?StorePaymentAccount
    {
        $account = $this->accounts->findOneBy([
            'store' => $store,
            'provider' => StorePaymentAccount::PROVIDER_SQUARE,
            'status' => StorePaymentAccount::STATUS_CONNECTED,
        ]);

        if (!$account instanceof StorePaymentAccount) {
            return null;
        }

        if (null === $account->getProviderLocationId()) {
            $this->syncLocation($account);
        }

        return $account;
    }

    /**
     * Decrypt the access token, refreshing it first when it is close to expiry.
     */
    private function accessToken(StorePaymentAccount $account): string
    {
        $expiresAt = $account->getTokenExpiresAt();
        $stale = null !== $expiresAt && $expiresAt <= new \DateTimeImmutable(self::REFRESH_WINDOW);

        if ($stale) {
            $this->refresh($account);
        }

        $token = $this->cipher->decrypt((string) $account->getAccessTokenEncrypted());
        if (null === $token || '' === $token) {
            throw new \RuntimeException('This store is not accepting online payments right now.');
        }

        return $token;
    }

    private function refresh(StorePaymentAccount $account): void
    {
        $refreshToken = $this->cipher->decrypt((string) $account->getRefreshTokenEncrypted());
        if (null === $refreshToken || '' === $refreshToken) {
            return;
        }

        try {
            $token = $this->oauth->refreshToken($refreshToken);
        } catch (\RuntimeException $e) {
            // Keep the existing token: it may still have hours left, and the
            // charge attempt will surface a clearer error if it doesn't.
            $this->logger->error('Square token refresh failed', [
                'store' => $account->getStore()?->getSlug(),
                'error' => $e->getMessage(),
            ]);

            return;
        }

        $account
            ->setAccessTokenEncrypted($this->cipher->encrypt($token['accessToken']))
            ->setTokenExpiresAt($token['expiresAt']);

        if (null !== $token['refreshToken']) {
            $account->setRefreshTokenEncrypted($this->cipher->encrypt($token['refreshToken']));
        }

        $this->entityManager->flush();
    }

    /**
     * @param array<string, mixed> $body
     *
     * @return array<string, mixed>
     */
    private function request(StorePaymentAccount $account, string $method, string $path, array $body = []): array
    {
        $accessToken = $this->accessToken($account);

        try {
            $options = [
                'headers' => [
                    'Authorization' => 'Bearer '.$accessToken,
                    'Square-Version' => $this->credentials->apiVersion(),
                    'Accept' => 'application/json',
                ],
            ];
            if ('GET' !== strtoupper($method) && [] !== $body) {
                $options['json'] = $body;
            }
            $response = $this->httpClient->request($method, $this->apiBaseUrl($account).$path, $options);
            $status = $response->getStatusCode();
            $decoded = json_decode($response->getContent(false), true);
        } catch (\Throwable $e) {
            $this->logger->error('Square checkout request failed', ['error' => $e->getMessage()]);

            throw new \RuntimeException('We could not reach the payment processor. Please try again.');
        }

        $payload = is_array($decoded) ? $decoded : [];

        if ($status >= 400) {
            throw new \RuntimeException($this->errorMessage($account, $payload));
        }

        return $payload;
    }

    /**
     * Card problems belong to the shopper and are shown verbatim. Credential
     * problems belong to the store owner: flag the connection and show the
     * shopper something generic instead of leaking our integration state.
     *
     * @param array<string, mixed> $payload
     */
    private function errorMessage(StorePaymentAccount $account, array $payload): string
    {
        $error = is_array($payload['errors'][0] ?? null) ? $payload['errors'][0] : [];
        $category = (string) ($error['category'] ?? '');
        $detail = trim((string) ($error['detail'] ?? ''));

        if (in_array($category, ['AUTHENTICATION_ERROR', 'AUTHORIZATION_ERROR'], true)) {
            $account->setLastError($detail ?: 'Square rejected the store credentials.');
            $this->entityManager->flush();

            return 'This store is not accepting online payments right now.';
        }

        if ('PAYMENT_METHOD_ERROR' === $category && '' !== $detail) {
            return $detail;
        }

        $this->logger->error('Square declined a checkout payment', ['category' => $category, 'detail' => $detail]);

        return 'Your payment could not be completed. Please try another card.';
    }

    /** Follows the account's own environment: a sandbox-linked store stays sandbox. */
    private function apiBaseUrl(StorePaymentAccount $account): string
    {
        return $this->credentials->apiBaseUrl($account->getEnvironment());
    }
}
