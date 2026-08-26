<?php

namespace App\Service\Payments;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Thin PayPal REST helper: client-credentials token + JSON requests.
 */
final class PaypalClient
{
    private ?array $cachedToken = null;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly PaypalCredentials $credentials,
    ) {
    }

    /**
     * @param array<string, mixed> $json
     *
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, array $json = [], ?string $paypalRequestId = null): array
    {
        $headers = [
            'Authorization' => 'Bearer '.$this->accessToken(),
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ];
        $bn = $this->credentials->partnerAttributionId();
        if ('' !== $bn) {
            $headers['PayPal-Partner-Attribution-Id'] = $bn;
        }
        if (null !== $paypalRequestId && '' !== $paypalRequestId) {
            $headers['PayPal-Request-Id'] = mb_substr($paypalRequestId, 0, 108);
        }

        $options = ['headers' => $headers];
        $method = strtoupper($method);
        if ([] !== $json) {
            $options['json'] = $json;
        } elseif (in_array($method, ['POST', 'PATCH', 'PUT'], true)) {
            // PayPal rejects a JSON array. An empty PHP [] encodes as [] and
            // capture returns 400/422 "The request JSON is not well formed."
            $options['json'] = new \stdClass();
        }

        $response = $this->httpClient->request($method, $this->credentials->apiBaseUrl().$path, $options);
        $data = $response->toArray(false);
        if ($response->getStatusCode() >= 400) {
            throw new \RuntimeException($this->errorMessage($data, 'PayPal request failed.'));
        }

        return is_array($data) ? $data : [];
    }

    public function accessToken(): string
    {
        if (is_array($this->cachedToken) && time() < (int) ($this->cachedToken['expiresAt'] ?? 0)) {
            return (string) $this->cachedToken['accessToken'];
        }

        if (!$this->credentials->isConfigured()) {
            throw new \RuntimeException('PayPal is not configured.');
        }

        $response = $this->httpClient->request('POST', $this->credentials->apiBaseUrl().'/v1/oauth2/token', [
            'auth_basic' => [$this->credentials->clientId(), $this->credentials->clientSecret()],
            'body' => ['grant_type' => 'client_credentials'],
            'headers' => ['Accept' => 'application/json'],
        ]);
        $data = $response->toArray(false);
        if ($response->getStatusCode() >= 400) {
            throw new \RuntimeException($this->errorMessage($data, 'PayPal rejected the client credentials.'));
        }

        $token = (string) ($data['access_token'] ?? '');
        if ('' === $token) {
            throw new \RuntimeException('PayPal did not return an access token.');
        }

        $this->cachedToken = [
            'accessToken' => $token,
            'expiresAt' => time() + max(30, ((int) ($data['expires_in'] ?? 300)) - 60),
        ];

        return $token;
    }

    /** @param array<string, mixed> $data */
    public function errorMessage(array $data, string $fallback): string
    {
        $details = $data['details'] ?? null;
        if (is_array($details) && isset($details[0]) && is_array($details[0])) {
            return (string) ($details[0]['description'] ?? $details[0]['issue'] ?? $fallback);
        }

        $message = $data['message'] ?? $data['error_description'] ?? $data['error'] ?? null;

        return is_string($message) && '' !== trim($message) ? $message : $fallback;
    }
}
