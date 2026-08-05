<?php

namespace App\Service\Payments;

/**
 * Authenticates Square webhook callbacks.
 *
 * Square signs the concatenation of the notification URL and the raw request
 * body with the subscription's signature key. Verifying that is the only thing
 * separating a real event from anyone who can POST to a public endpoint, so an
 * unconfigured key rejects everything rather than waving traffic through.
 */
final readonly class SquareWebhookVerifier
{
    public const SIGNATURE_HEADER = 'x-square-hmacsha256-signature';

    public function __construct(private SquareCredentials $credentials)
    {
    }

    public function isConfigured(): bool
    {
        return '' !== $this->credentials->webhookSignatureKey()
            && '' !== $this->credentials->webhookUrl();
    }

    public function verify(string $rawBody, ?string $signature): bool
    {
        if (!$this->isConfigured() || null === $signature || '' === $signature) {
            return false;
        }

        $expected = base64_encode(hash_hmac(
            'sha256',
            $this->credentials->webhookUrl().$rawBody,
            $this->credentials->webhookSignatureKey(),
            true,
        ));

        // Constant time: a fast reject would leak the signature byte by byte.
        return hash_equals($expected, $signature);
    }
}
