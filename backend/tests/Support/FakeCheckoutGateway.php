<?php

namespace App\Tests\Support;

use App\Entity\Store;
use App\Service\Payments\CheckoutGatewayInterface;
use App\Service\Payments\SquareInvoiceMinimum;

/**
 * Stands in for Square during tests: records what would have been charged and
 * can be told to decline, so checkout's money paths are exercised without
 * network access.
 */
final class FakeCheckoutGateway implements CheckoutGatewayInterface
{
    public bool $ready = true;

    /** Message thrown instead of charging; null means the charge succeeds. */
    public ?string $declineWith = null;

    /** @var list<array{amount: int, sourceId: string, idempotencyKey: string, lineItems: ?array}> */
    public array $charges = [];

    /** @var list<array{paymentId: string, amount: int, idempotencyKey: string, reason: ?string}> */
    public array $refunds = [];

    /** @var list<array{amount: int, idempotencyKey: string, referenceId: string}> */
    public array $paymentLinks = [];

    /** @var list<array{idempotencyKey: string, referenceId: string, email: ?string, lineItems?: list<array{name: string, quantity: int, priceCents: int}>}> */
    public array $invoices = [];

    /** @var list<string> */
    public array $cancelledInvoices = [];

    /** Message thrown instead of refunding; null means the refund succeeds. */
    public ?string $refundDeclineWith = null;

    /** Extra sales tax added onto charges and quotes (0 keeps existing tests pre-tax). */
    public int $addedTaxCents = 0;

    /** When true, charge() throws as if Square CreateOrder failed. */
    public bool $failCreateOrder = false;

    /** When true, createPayInStoreInvoice() throws so pay-in-store can fall back to a payment link. */
    public bool $failInvoice = false;

    /** When true, cancelInvoice() throws so line-edit refresh keeps the current invoice. */
    public bool $failCancelInvoice = false;

    /** @var list<array{lineItems: array, creditCents: int}> */
    public array $quotes = [];

    public function checkoutConfig(Store $store): array
    {
        return [
            'enabled' => $this->ready,
            'message' => $this->ready ? null : 'Checkout is disabled in this test environment.',
            'ownerMessage' => $this->ready ? null : 'Fake checkout gateway disabled.',
            'applicationId' => 'sandbox-app-id',
            'locationId' => $this->ready ? 'LOCATION1' : '',
            'environment' => 'sandbox',
            'currency' => 'USD',
            'countryCode' => 'US',
        ];
    }

    public function isReady(Store $store): bool
    {
        return $this->ready;
    }

    public function quotePickupTotals(Store $store, array $lineItems, int $creditCents = 0): array
    {
        $this->quotes[] = ['lineItems' => $lineItems, 'creditCents' => $creditCents];
        $merchandise = 0;
        foreach ($lineItems as $item) {
            $merchandise += max(0, (int) ($item['priceCents'] ?? 0)) * max(1, (int) ($item['quantity'] ?? 1));
        }
        $due = max(0, $merchandise - max(0, $creditCents)) + max(0, $this->addedTaxCents);

        return [
            'taxCents' => max(0, $this->addedTaxCents),
            'dueCents' => $due,
        ];
    }

    public function charge(
        Store $store,
        int $amountCents,
        string $sourceId,
        string $idempotencyKey,
        ?string $verificationToken = null,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
        ?string $customerId = null,
        ?array $lineItems = null,
        int $creditCents = 0,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }
        if ($this->failCreateOrder) {
            throw new \RuntimeException('Could not calculate sales tax for this order. Try again or pay in store.');
        }

        $taxCents = max(0, $this->addedTaxCents);
        $chargedCents = $amountCents + $taxCents;
        $platformFeeCents = 0;

        $this->charges[] = [
            'amount' => $chargedCents,
            'sourceId' => $sourceId,
            'idempotencyKey' => $idempotencyKey,
            'lineItems' => $lineItems,
            'taxCents' => $taxCents,
            'platformFeeCents' => $platformFeeCents,
        ];

        $n = count($this->charges);

        return [
            'paymentId' => 'sqpmt_'.$n,
            'status' => 'COMPLETED',
            'receiptUrl' => 'https://squareup.com/receipt/test',
            'squareOrderId' => null !== $lineItems && [] !== $lineItems ? 'sqord_'.$n : null,
            'taxCents' => $taxCents,
            'chargedCents' => $chargedCents,
            'platformFeeCents' => $platformFeeCents,
        ];
    }

    public function chargeVaultedCard(
        Store $store,
        int $amountCents,
        string $customerId,
        string $cardId,
        string $idempotencyKey,
        ?string $referenceId = null,
        ?string $buyerEmail = null,
        ?array $lineItems = null,
        int $creditCents = 0,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array {
        return $this->charge(
            $store,
            $amountCents,
            $cardId,
            $idempotencyKey,
            null,
            $referenceId,
            $buyerEmail,
            $customerId,
            $lineItems,
            $creditCents,
            $buyerName,
            $fulfillment,
        );
    }

    public function refund(Store $store, string $paymentId, int $amountCents, string $idempotencyKey, ?string $reason = null): array
    {
        if (null !== $this->refundDeclineWith) {
            throw new \RuntimeException($this->refundDeclineWith);
        }

        $this->refunds[] = [
            'paymentId' => $paymentId,
            'amount' => $amountCents,
            'idempotencyKey' => $idempotencyKey,
            'reason' => $reason,
        ];

        return [
            'refundId' => 'sqrfd_'.count($this->refunds),
            'status' => 'COMPLETED',
        ];
    }

    public function createPaymentLink(
        Store $store,
        int $amountCents,
        string $idempotencyKey,
        string $referenceId,
        array $lineItems,
        int $creditCents = 0,
        ?string $buyerEmail = null,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
        ?string $paymentNote = null,
    ): array {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }

        $this->paymentLinks[] = [
            'amount' => $amountCents,
            'idempotencyKey' => $idempotencyKey,
            'referenceId' => $referenceId,
        ];

        $n = count($this->paymentLinks);

        return [
            'url' => 'https://square.link/u/test-'.$referenceId,
            'squareOrderId' => 'sqord_link_'.$n,
        ];
    }

    public function createPayInStoreInvoice(
        Store $store,
        string $idempotencyKey,
        string $referenceId,
        array $lineItems,
        int $creditCents = 0,
        ?string $buyerEmail = null,
        ?string $buyerName = null,
        string $fulfillment = 'pickup',
    ): array {
        if (null !== $this->declineWith) {
            throw new \RuntimeException($this->declineWith);
        }
        if ($this->failInvoice) {
            throw new \RuntimeException('Square invoices are not available for this store.');
        }
        $email = trim((string) $buyerEmail);
        if ('' === $email) {
            throw new \RuntimeException('A customer email is required to create a Square invoice.');
        }

        $due = 0;
        foreach ($lineItems as $item) {
            $due += max(0, (int) ($item['priceCents'] ?? 0)) * max(1, (int) ($item['quantity'] ?? 1));
        }
        $due = max(0, $due - max(0, $creditCents)) + max(0, $this->addedTaxCents);
        $padded = SquareInvoiceMinimum::invoiceLineItems($lineItems, $this->addedTaxCents, $due);

        $this->invoices[] = [
            'idempotencyKey' => $idempotencyKey,
            'referenceId' => $referenceId,
            'email' => $email,
            'lineItems' => $padded,
        ];

        $token = bin2hex(random_bytes(4));

        return [
            'url' => 'https://squareup.com/pay-invoice/test-'.$referenceId,
            'squareOrderId' => 'sqord_inv_'.$token,
            'squareInvoiceId' => 'sqinv_'.$token,
        ];
    }

    public function cancelInvoice(Store $store, string $invoiceId): void
    {
        $id = trim($invoiceId);
        if ('' === $id) {
            return;
        }
        if ($this->failCancelInvoice) {
            throw new \RuntimeException('Square invoice could not be canceled.');
        }
        $this->cancelledInvoices[] = $id;
    }

    public function vaultPaymentMethod(
        Store $store,
        string $sourceId,
        ?string $verificationToken,
        array $buyer,
        ?string $existingCustomerId,
        ?string $previousCardId,
    ): array {
        return [
            'customerId' => $existingCustomerId ?? 'sqcust_test',
            'cardId' => 'sqcard_'.bin2hex(random_bytes(4)),
            'last4' => '4242',
            'brand' => 'VISA',
            'expMonth' => '12',
            'expYear' => '2030',
        ];
    }
}
