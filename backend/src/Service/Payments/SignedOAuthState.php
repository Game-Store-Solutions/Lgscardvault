<?php

namespace App\Service\Payments;

use Symfony\Component\DependencyInjection\ParameterBag\ParameterBagInterface;

final readonly class SignedOAuthState
{
    public function __construct(private ParameterBagInterface $parameters)
    {
    }

    public function create(string $provider, string $storeSlug, int $userId, int $ttlSeconds = 600, string $redirectUri = ''): string
    {
        $payload = [
            'provider' => $provider,
            'storeSlug' => $storeSlug,
            'userId' => $userId,
            'expiresAt' => time() + $ttlSeconds,
            'nonce' => bin2hex(random_bytes(16)),
        ];
        if ('' !== trim($redirectUri)) {
            $payload['redirectUri'] = trim($redirectUri);
        }

        $encodedPayload = $this->base64UrlEncode(json_encode($payload, JSON_THROW_ON_ERROR));
        $signature = $this->sign($encodedPayload);

        return $encodedPayload.'.'.$signature;
    }

    /** @return array{provider: string, storeSlug: string, userId: int, expiresAt: int, nonce: string, redirectUri?: string} */
    public function verify(string $state): array
    {
        [$encodedPayload, $signature] = array_pad(explode('.', $state, 2), 2, '');
        if ('' === $encodedPayload || '' === $signature) {
            throw new \InvalidArgumentException('OAuth state is malformed.');
        }

        if (!hash_equals($this->sign($encodedPayload), $signature)) {
            throw new \InvalidArgumentException('OAuth state signature is invalid.');
        }

        $payload = json_decode($this->base64UrlDecode($encodedPayload), true, flags: JSON_THROW_ON_ERROR);
        if (!is_array($payload) || time() > (int) ($payload['expiresAt'] ?? 0)) {
            throw new \InvalidArgumentException('OAuth state has expired.');
        }

        return [
            'provider' => (string) $payload['provider'],
            'storeSlug' => (string) $payload['storeSlug'],
            'userId' => (int) $payload['userId'],
            'expiresAt' => (int) $payload['expiresAt'],
            'nonce' => (string) $payload['nonce'],
            'redirectUri' => isset($payload['redirectUri']) ? (string) $payload['redirectUri'] : '',
        ];
    }

    private function sign(string $payload): string
    {
        return $this->base64UrlEncode(hash_hmac('sha256', $payload, $this->secret(), true));
    }

    private function secret(): string
    {
        return (string) $this->parameters->get('kernel.secret');
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if (false === $decoded) {
            throw new \InvalidArgumentException('OAuth state encoding is invalid.');
        }

        return $decoded;
    }
}
