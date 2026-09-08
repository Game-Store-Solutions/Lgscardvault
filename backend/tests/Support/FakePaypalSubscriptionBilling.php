<?php

namespace App\Tests\Support;

use App\Service\Payments\PaypalClient;
use App\Service\Payments\PaypalCredentials;
use App\Service\Payments\PaypalSubscriptionBilling;
use Symfony\Component\HttpClient\MockHttpClient;

/**
 * Network-free stand-in for platform PayPal SaaS billing in the test kernel.
 * Records charges the same way {@see FakeSubscriptionBilling} does for Square.
 */
final class FakePaypalSubscriptionBilling extends PaypalSubscriptionBilling
{
    public bool $live = true;

    public ?string $declineWith = null;

    /** @var list<array{customerId: string, cardId: string, amount: int, idempotencyKey: string|null, kind: string}> */
    public array $charges = [];

    public function __construct()
    {
        parent::__construct(
            new PaypalClient(new MockHttpClient(), new PaypalCredentials()),
            new PaypalCredentials(),
        );
    }

    public function isLive(): bool
    {
        return $this->live;
    }

    public function clientConfig(): array
    {
        return [
            'enabled' => $this->live,
            'clientId' => 'sandbox-paypal-client',
            'environment' => 'sandbox',
            'currency' => 'USD',
        ];
    }

    public function createOrder(int $priceCents, ?string $reference = null, ?string $buyerEmail = null): string
    {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        return 'MOCK-PAYPAL-ORDER-'.strtoupper(bin2hex(random_bytes(3)));
    }

    public function startSubscription(string $orderId, int $priceCents, array $buyer = []): array
    {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        $this->charges[] = [
            'customerId' => 'PAYER1',
            'cardId' => 'VAULT1',
            'amount' => $priceCents,
            'idempotencyKey' => 'start-'.$orderId,
            'kind' => 'start',
        ];

        return [
            'reference' => 'CAP'.count($this->charges),
            'customerId' => 'PAYER1',
            'cardId' => 'VAULT1',
            'last4' => null,
            'brand' => 'PAYPAL',
            'status' => 'active',
            'chargedCents' => $priceCents,
        ];
    }

    public function replaceVaultedCard(string $customerId, ?string $previousCardId, string $orderId, ?string $verificationToken = null): array
    {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        $this->charges[] = [
            'customerId' => $customerId,
            'cardId' => 'VAULT2',
            'amount' => 1,
            'idempotencyKey' => 'replace-'.$orderId,
            'kind' => 'replace',
        ];

        return ['cardId' => 'VAULT2', 'last4' => null, 'brand' => 'PAYPAL'];
    }

    public function chargeVaultedCard(string $customerId, string $cardId, int $priceCents, ?string $idempotencyKey = null): array
    {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        $this->charges[] = [
            'customerId' => $customerId,
            'cardId' => $cardId,
            'amount' => $priceCents,
            'idempotencyKey' => $idempotencyKey,
            'kind' => 'renew',
        ];

        return ['reference' => 'CAP'.count($this->charges), 'status' => 'active'];
    }
}
