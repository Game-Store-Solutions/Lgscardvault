<?php

namespace App\Tests\Support;

use App\Service\Payments\SubscriptionBillingInterface;

/**
 * Stands in for platform subscription billing during tests: records every
 * charge (including its idempotency key, so double-billing is detectable) and
 * can be told to decline, without reaching Square.
 */
final class FakeSubscriptionBilling implements SubscriptionBillingInterface
{
    public bool $live = true;

    /** Message thrown instead of charging; null means the charge succeeds. */
    public ?string $declineWith = null;

    /** @var list<array{customerId: string, cardId: string, amount: int, idempotencyKey: string|null}> */
    public array $charges = [];

    public function isLive(): bool
    {
        return $this->live;
    }

    public function environment(): string
    {
        return 'sandbox';
    }

    public function clientConfig(): array
    {
        return [
            'mode' => $this->live ? 'square' : 'mock',
            'environment' => 'sandbox',
            'applicationId' => 'sandbox-app-id',
            'locationId' => 'LOCATION1',
            'methods' => self::METHODS,
            'currency' => 'USD',
            'countryCode' => 'US',
        ];
    }

    public function startSubscription(string $sourceId, int $priceCents, array $buyer = [], ?string $verificationToken = null): array
    {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        return [
            'reference' => 'sqpmt_start_'.count($this->charges),
            'customerId' => 'CUST1',
            'cardId' => 'ccof:CARD1',
            'last4' => '1111',
            'brand' => 'VISA',
            'status' => 'active',
        ];
    }

    public function replaceVaultedCard(string $customerId, ?string $previousCardId, string $sourceId, ?string $verificationToken = null): array
    {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        return ['cardId' => 'ccof:CARD2', 'last4' => '4242', 'brand' => 'VISA'];
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
        ];

        return ['reference' => 'sqpmt_renew_'.count($this->charges), 'status' => 'active'];
    }
}
