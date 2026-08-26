<?php

namespace App\Service\Payments;

/**
 * PayPal Commerce Platform seller onboarding — the Square OAuth equivalent.
 */
final readonly class PaypalPartnerClient
{
    public function __construct(
        private PaypalClient $client,
        private PaypalCredentials $credentials,
    ) {
    }

    public function isConfigured(): bool
    {
        return $this->credentials->isConfigured();
    }

    public function environment(): string
    {
        return $this->credentials->environment();
    }

    /**
     * @return array{authorizationUrl: string, referralId: string|null}
     */
    public function createReferral(string $trackingId, string $returnUrl): array
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('PayPal Connect is not configured.');
        }

        $data = $this->client->request('POST', '/v2/customer/partner-referrals', [
            'tracking_id' => mb_substr($trackingId, 0, 127),
            'operations' => [[
                'operation' => 'API_INTEGRATION',
                'api_integration_preference' => [
                    'rest_api_integration' => [
                        'integration_method' => 'PAYPAL',
                        'integration_type' => 'THIRD_PARTY',
                        'third_party_details' => [
                            'features' => ['PAYMENT', 'REFUND'],
                        ],
                    ],
                ],
            ]],
            'products' => ['EXPRESS_CHECKOUT'],
            'legal_consents' => [[
                'type' => 'SHARE_DATA_CONSENT',
                'granted' => true,
            ]],
            'partner_config_override' => [
                'return_url' => $returnUrl,
            ],
        ]);

        $url = $this->actionUrl($data);
        if ('' === $url) {
            throw new \RuntimeException('PayPal did not return an onboarding URL.');
        }

        return [
            'authorizationUrl' => $url,
            'referralId' => isset($data['id']) ? (string) $data['id'] : null,
        ];
    }

    /** @param array<string, mixed> $data */
    private function actionUrl(array $data): string
    {
        $links = is_array($data['links'] ?? null) ? $data['links'] : [];
        foreach ($links as $link) {
            if (!is_array($link)) {
                continue;
            }
            $rel = (string) ($link['rel'] ?? '');
            if (in_array($rel, ['action_url', 'self'], true) && isset($link['href']) && 'action_url' === $rel) {
                return (string) $link['href'];
            }
        }
        foreach ($links as $link) {
            if (is_array($link) && isset($link['href']) && 'action_url' === ($link['rel'] ?? '')) {
                return (string) $link['href'];
            }
        }
        foreach ($links as $link) {
            if (is_array($link) && isset($link['href'])) {
                return (string) $link['href'];
            }
        }

        return '';
    }
}
