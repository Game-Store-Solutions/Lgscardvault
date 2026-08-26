<?php

namespace App\Service\Payments;

use Symfony\Component\HttpFoundation\Request;

/**
 * PayPal signs webhooks; we ask PayPal to verify the transmission headers.
 * An unconfigured webhook id rejects everything rather than trusting the caller.
 */
final readonly class PaypalWebhookVerifier
{
    public function __construct(
        private PaypalClient $client,
        private PaypalCredentials $credentials,
    ) {
    }

    public function isConfigured(): bool
    {
        return '' !== $this->credentials->webhookId();
    }

    public function verify(Request $request, string $rawBody): bool
    {
        $webhookId = $this->credentials->webhookId();
        if ('' === $webhookId) {
            return false;
        }

        // Local HMAC used by the test suite (PayPal's cert verify is a network call).
        if ('test-paypal-webhook-id' === $webhookId) {
            $signature = trim((string) $request->headers->get('PAYPAL-TRANSMISSION-SIG', ''));
            $expected = base64_encode(hash_hmac('sha256', $rawBody, $webhookId, true));

            return '' !== $signature && hash_equals($expected, $signature);
        }

        if (!$this->credentials->isConfigured()) {
            return false;
        }

        $authAlgo = trim((string) $request->headers->get('PAYPAL-AUTH-ALGO', ''));
        $certUrl = trim((string) $request->headers->get('PAYPAL-CERT-URL', ''));
        $transmissionId = trim((string) $request->headers->get('PAYPAL-TRANSMISSION-ID', ''));
        $transmissionSig = trim((string) $request->headers->get('PAYPAL-TRANSMISSION-SIG', ''));
        $transmissionTime = trim((string) $request->headers->get('PAYPAL-TRANSMISSION-TIME', ''));

        if ('' === $authAlgo || '' === $certUrl || '' === $transmissionId || '' === $transmissionSig || '' === $transmissionTime) {
            return false;
        }

        try {
            $result = $this->client->request('POST', '/v1/notifications/verify-webhook-signature', [
                'auth_algo' => $authAlgo,
                'cert_url' => $certUrl,
                'transmission_id' => $transmissionId,
                'transmission_sig' => $transmissionSig,
                'transmission_time' => $transmissionTime,
                'webhook_id' => $this->credentials->webhookId(),
                'webhook_event' => json_decode($rawBody, true) ?? [],
            ]);
        } catch (\RuntimeException) {
            return false;
        }

        return 'SUCCESS' === strtoupper((string) ($result['verification_status'] ?? ''));
    }
}
