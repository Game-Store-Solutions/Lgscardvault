<?php

namespace App\Service\Payments;

use App\Entity\Store;
use App\Entity\StorePaymentAccount;

/**
 * Public checkout config: Square fields plus a nested PayPal block.
 */
final readonly class StoreCheckoutPresenter
{
    public function __construct(
        private CheckoutGatewayInterface $square,
        private PaypalCheckoutGatewayInterface $paypal,
    ) {
    }

    /** @return array<string, mixed> */
    public function checkoutConfig(Store $store): array
    {
        $config = $this->square->checkoutConfig($store);
        $config['paypal'] = $this->paypal->checkoutConfig($store);
        $paypalEnabled = (bool) ($config['paypal']['enabled'] ?? false);
        if (!$config['enabled'] && !$paypalEnabled) {
            $config['ownerMessage'] = 'This store has not connected Square or PayPal for online checkout yet.';
        }

        return $config;
    }

    public function acceptsOnlinePayment(Store $store, ?string $provider = null): bool
    {
        return match ($provider) {
            StorePaymentAccount::PROVIDER_PAYPAL => $this->paypal->isReady($store),
            StorePaymentAccount::PROVIDER_SQUARE => $this->square->isReady($store),
            default => $this->square->isReady($store) || $this->paypal->isReady($store),
        };
    }

    public static function providerFromPayload(array $payload): string
    {
        $explicit = strtolower(trim((string) ($payload['provider'] ?? '')));

        return StorePaymentAccount::PROVIDER_PAYPAL === $explicit
            ? StorePaymentAccount::PROVIDER_PAYPAL
            : StorePaymentAccount::PROVIDER_SQUARE;
    }
}
