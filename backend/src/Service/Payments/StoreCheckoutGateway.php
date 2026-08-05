<?php

namespace App\Service\Payments;

use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Repository\StorePaymentAccountRepository;
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
 * The platform never touches the funds.
 */
final class StoreCheckoutGateway implements CheckoutGatewayInterface
{
    /** Refresh this far ahead of expiry so a live checkout never races the clock. */
    private const REFRESH_WINDOW = '+7 days';

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly SquareOAuthClient $oauth,
        private readonly SquareCredentials $credentials,
        private readonly StorePaymentAccountRepository $accounts,
        private readonly SecretCipher $cipher,
        private readonly EntityManagerInterface $entityManager,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Public Web Payments SDK configuration for a store's checkout form.
     * Returns disabled rather than throwing so the cart can render a clear
     * "this store isn't taking online payments yet" state.
     *
     * @return array{enabled: bool, applicationId: string, locationId: string, environment: string, currency: string, countryCode: string}
     */
    public function checkoutConfig(Store $store): array
    {
        $account = $this->connectedAccount($store);
        $locationId = $account?->getProviderLocationId();
        // The browser SDK must be initialised with the app id for the same
        // environment the store linked in, not whichever the platform runs now.
        $environment = $account?->getEnvironment() ?? $this->credentials->environment();

        return [
            'enabled' => null !== $account && null !== $locationId && '' !== $locationId && $this->oauth->isConfigured(),
            'applicationId' => $this->credentials->applicationId($environment),
            'locationId' => (string) $locationId,
            'environment' => $environment,
            'currency' => $this->credentials->currency(),
            'countryCode' => $this->credentials->countryCode(),
        ];
    }

    public function isReady(Store $store): bool
    {
        return true === $this->checkoutConfig($store)['enabled'];
    }

    /**
     * Charge the shopper. `$idempotencyKey` must be stable for a given order so
     * a retried request can never take the money twice.
     *
     * @return array{paymentId: string, status: string, receiptUrl: string|null}
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

        $payload = [
            'idempotency_key' => $idempotencyKey,
            'source_id' => $sourceId,
            'location_id' => $locationId,
            'autocomplete' => true,
            'amount_money' => ['amount' => $amountCents, 'currency' => $this->credentials->currency()],
        ];
        if (null !== $verificationToken && '' !== $verificationToken) {
            $payload['verification_token'] = $verificationToken;
        }
        if (null !== $referenceId && '' !== $referenceId) {
            $payload['reference_id'] = substr($referenceId, 0, 40);
        }
        if (null !== $buyerEmail && '' !== $buyerEmail) {
            $payload['buyer_email_address'] = $buyerEmail;
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
    private function request(StorePaymentAccount $account, string $method, string $path, array $body): array
    {
        $accessToken = $this->accessToken($account);

        try {
            $response = $this->httpClient->request($method, $this->apiBaseUrl($account).$path, [
                'headers' => [
                    'Authorization' => 'Bearer '.$accessToken,
                    'Square-Version' => $this->credentials->apiVersion(),
                    'Accept' => 'application/json',
                ],
                'json' => $body,
            ]);
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
