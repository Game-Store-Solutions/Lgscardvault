<?php

namespace App\Service\Store;

use App\Entity\Store;
use Symfony\Component\DependencyInjection\ParameterBag\ParameterBagInterface;

/**
 * Long-lived signed token for a locked kiosk terminal. Survives owner JWT
 * expiry so customers keep shopping without a session-expired login bounce.
 */
final readonly class KioskSessionToken
{
    private const PURPOSE = 'kiosk_session';
    private const TTL_SECONDS = 60 * 60 * 24 * 7;

    public function __construct(private ParameterBagInterface $parameters)
    {
    }

    public function issue(Store $store): string
    {
        $slug = $store->getSlug();
        if (null === $slug || '' === $slug) {
            throw new \InvalidArgumentException('Store slug is required to start a kiosk session.');
        }

        $payload = [
            'purpose' => self::PURPOSE,
            'storeSlug' => $slug,
            'expiresAt' => time() + self::TTL_SECONDS,
            'nonce' => bin2hex(random_bytes(16)),
        ];

        $encodedPayload = $this->base64UrlEncode(json_encode($payload, \JSON_THROW_ON_ERROR));

        return $encodedPayload.'.'.$this->sign($encodedPayload);
    }

    public function verify(Store $store, string $token): bool
    {
        $token = trim($token);
        if ('' === $token) {
            return false;
        }

        [$encodedPayload, $signature] = array_pad(explode('.', $token, 2), 2, '');
        if ('' === $encodedPayload || '' === $signature) {
            return false;
        }

        if (!hash_equals($this->sign($encodedPayload), $signature)) {
            return false;
        }

        try {
            $payload = json_decode($this->base64UrlDecode($encodedPayload), true, flags: \JSON_THROW_ON_ERROR);
        } catch (\JsonException|\InvalidArgumentException) {
            return false;
        }

        if (!is_array($payload)) {
            return false;
        }

        if (self::PURPOSE !== ($payload['purpose'] ?? '')) {
            return false;
        }

        if (time() > (int) ($payload['expiresAt'] ?? 0)) {
            return false;
        }

        return (string) ($payload['storeSlug'] ?? '') === (string) $store->getSlug();
    }

    private function sign(string $payload): string
    {
        return $this->base64UrlEncode(hash_hmac('sha256', $payload, (string) $this->parameters->get('kernel.secret'), true));
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if (false === $decoded) {
            throw new \InvalidArgumentException('Invalid kiosk session token encoding.');
        }

        return $decoded;
    }
}
