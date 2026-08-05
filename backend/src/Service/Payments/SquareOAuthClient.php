<?php

namespace App\Service\Payments;

use Symfony\Contracts\HttpClient\HttpClientInterface;

final readonly class SquareOAuthClient
{
    private const DEFAULT_SCOPES = [
        'MERCHANT_PROFILE_READ',
        'ORDERS_READ',
        'ORDERS_WRITE',
        'PAYMENTS_READ',
        'PAYMENTS_WRITE',
    ];

    public function __construct(
        private HttpClientInterface $httpClient,
        private SquareCredentials $credentials,
    ) {
    }

    public function isConfigured(): bool
    {
        return '' !== $this->applicationId() && '' !== $this->applicationSecret();
    }

    public function environment(): string
    {
        return $this->credentials->environment();
    }

    /** @return list<string> */
    public function scopes(): array
    {
        $raw = (string) ($_ENV['SQUARE_OAUTH_SCOPES'] ?? $_SERVER['SQUARE_OAUTH_SCOPES'] ?? '');
        if ('' === trim($raw)) {
            return self::DEFAULT_SCOPES;
        }

        return array_values(array_filter(preg_split('/[\s,]+/', trim($raw)) ?: []));
    }

    public function authorizationUrl(string $redirectUri, string $state): string
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('Square OAuth is not configured.');
        }

        $params = [
            'client_id' => $this->applicationId(),
            'scope' => implode(' ', $this->scopes()),
            'state' => $state,
            'redirect_uri' => $redirectUri,
        ];

        if ('production' === $this->environment()) {
            $params['session'] = 'false';
        }

        return $this->oauthBaseUrl().'/authorize?'.http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * @return array{
     *   accessToken: string,
     *   refreshToken: string|null,
     *   merchantId: string|null,
     *   expiresAt: \DateTimeImmutable|null
     * }
     */
    public function obtainToken(string $code, string $redirectUri): array
    {
        $response = $this->httpClient->request('POST', $this->oauthBaseUrl().'/token', [
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
            'json' => [
                'client_id' => $this->applicationId(),
                'client_secret' => $this->applicationSecret(),
                'code' => $code,
                'grant_type' => 'authorization_code',
                'redirect_uri' => $redirectUri,
            ],
        ]);

        $data = $response->toArray(false);
        if ($response->getStatusCode() >= 400) {
            throw new \RuntimeException($this->errorMessage($data, 'Square rejected the OAuth authorization code.'));
        }

        return [
            'accessToken' => (string) ($data['access_token'] ?? ''),
            'refreshToken' => isset($data['refresh_token']) ? (string) $data['refresh_token'] : null,
            'merchantId' => isset($data['merchant_id']) ? (string) $data['merchant_id'] : null,
            'expiresAt' => isset($data['expires_at']) ? new \DateTimeImmutable((string) $data['expires_at']) : null,
        ];
    }

    /**
     * Square OAuth access tokens expire (30 days), so a store that connected
     * once would silently stop taking payments without this.
     *
     * @return array{
     *   accessToken: string,
     *   refreshToken: string|null,
     *   merchantId: string|null,
     *   expiresAt: \DateTimeImmutable|null
     * }
     */
    public function refreshToken(string $refreshToken): array
    {
        $response = $this->httpClient->request('POST', $this->oauthBaseUrl().'/token', [
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
            'json' => [
                'client_id' => $this->applicationId(),
                'client_secret' => $this->applicationSecret(),
                'refresh_token' => $refreshToken,
                'grant_type' => 'refresh_token',
            ],
        ]);

        $data = $response->toArray(false);
        if ($response->getStatusCode() >= 400) {
            throw new \RuntimeException($this->errorMessage($data, 'Square rejected the refresh token.'));
        }

        return [
            'accessToken' => (string) ($data['access_token'] ?? ''),
            // Square may rotate the refresh token; keep the old one if it doesn't.
            'refreshToken' => isset($data['refresh_token']) ? (string) $data['refresh_token'] : null,
            'merchantId' => isset($data['merchant_id']) ? (string) $data['merchant_id'] : null,
            'expiresAt' => isset($data['expires_at']) ? new \DateTimeImmutable((string) $data['expires_at']) : null,
        ];
    }

    /**
     * The first active location for a connected merchant. Both the Web Payments
     * SDK and CreatePayment need a location id, and OAuth never returns one.
     */
    public function primaryLocationId(string $accessToken): ?string
    {
        $response = $this->httpClient->request('GET', $this->apiBaseUrl().'/v2/locations', [
            'headers' => [
                'Authorization' => 'Bearer '.$accessToken,
                'Square-Version' => $this->credentials->apiVersion(),
                'Accept' => 'application/json',
            ],
        ]);

        $data = $response->toArray(false);
        if ($response->getStatusCode() >= 400) {
            throw new \RuntimeException($this->errorMessage($data, 'Could not read Square locations.'));
        }

        $locations = is_array($data['locations'] ?? null) ? $data['locations'] : [];
        foreach ($locations as $location) {
            if (is_array($location) && 'ACTIVE' === ($location['status'] ?? null) && isset($location['id'])) {
                return (string) $location['id'];
            }
        }

        return null;
    }

    public function revoke(string $accessToken): void
    {
        if ('' === $accessToken) {
            return;
        }

        $response = $this->httpClient->request('POST', $this->oauthBaseUrl().'/revoke', [
            'headers' => [
                'Authorization' => 'Client '.$this->applicationSecret(),
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
            'json' => [
                'client_id' => $this->applicationId(),
                'access_token' => $accessToken,
            ],
        ]);

        if ($response->getStatusCode() >= 400) {
            $data = $response->toArray(false);
            throw new \RuntimeException($this->errorMessage($data, 'Could not revoke Square authorization.'));
        }
    }

    private function oauthBaseUrl(): string
    {
        return $this->apiBaseUrl().'/oauth2';
    }

    private function apiBaseUrl(): string
    {
        return $this->credentials->apiBaseUrl();
    }

    private function applicationId(): string
    {
        return $this->credentials->applicationId();
    }

    private function applicationSecret(): string
    {
        return $this->credentials->applicationSecret();
    }

    /** @param array<string, mixed> $data */
    private function errorMessage(array $data, string $fallback): string
    {
        $errors = $data['errors'] ?? null;
        if (is_array($errors) && isset($errors[0]) && is_array($errors[0])) {
            return (string) ($errors[0]['detail'] ?? $errors[0]['code'] ?? $fallback);
        }

        return $fallback;
    }
}
