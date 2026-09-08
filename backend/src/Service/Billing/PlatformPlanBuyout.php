<?php

namespace App\Service\Billing;

use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Entity\SubscriptionCharge;
use App\Repository\StorePaymentAccountRepository;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\PaypalSubscriptionBilling;
use App\Service\Payments\SubscriptionBillingInterface;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Lets a usage-plan store put money toward the $450 cap using the card on file
 * or a connected Square / PayPal account.
 */
final readonly class PlatformPlanBuyout
{
    public const MIN_PARTIAL_CENTS = 100;

    public const SOURCE_VAULT = 'vault';

    public const SOURCE_SQUARE = 'square';

    public const SOURCE_PAYPAL = 'paypal';

    public const SOURCES = [self::SOURCE_VAULT, self::SOURCE_SQUARE, self::SOURCE_PAYPAL];

    public function __construct(
        private PlanCatalog $planCatalog,
        private PlatformFeeRecorder $feeRecorder,
        private SubscriptionBillingInterface $billing,
        private PaypalSubscriptionBilling $paypalBilling,
        private StorePaymentAccountRepository $accounts,
        private EntityManagerInterface $entityManager,
    ) {
    }

    public function remainingCents(Store $store): int
    {
        if (!$this->planCatalog->isUsagePlan($store->getPlanKey()) || $store->hasMetPlatformCap()) {
            return 0;
        }

        $cap = $this->planCatalog->platformCapCents($store->getPlanKey());

        return max(0, $cap - $store->getPlatformFeesPaidCents());
    }

    /**
     * @param array{email?: string, name?: string, reference?: string} $buyer
     *
     * @throws \InvalidArgumentException when the amount, source, or plan cannot be charged
     * @throws \RuntimeException when the processor declines
     */
    public function execute(
        Store $store,
        ?int $amountCents = null,
        string $source = self::SOURCE_VAULT,
        ?string $token = null,
        ?string $verificationToken = null,
        array $buyer = [],
    ): int {
        $remaining = $this->remainingCents($store);
        if ($remaining < 1) {
            throw new \InvalidArgumentException('There is nothing left to pay toward this plan.');
        }

        $chargeCents = $amountCents ?? $remaining;
        if ($chargeCents < 1) {
            throw new \InvalidArgumentException('Enter an amount of at least $0.01.');
        }
        if ($chargeCents > $remaining) {
            throw new \InvalidArgumentException(sprintf(
                'That is more than the remaining $%s toward the platform cap.',
                number_format($remaining / 100, 2),
            ));
        }
        if (null !== $amountCents && $chargeCents < self::MIN_PARTIAL_CENTS && $remaining >= self::MIN_PARTIAL_CENTS) {
            throw new \InvalidArgumentException('Enter at least $1.00, or pay the remaining balance in full.');
        }

        $source = strtolower($source);
        if (!in_array($source, self::SOURCES, true)) {
            throw new \InvalidArgumentException('Choose Square, PayPal, or the card on file.');
        }

        $idempotencyKey = sprintf(
            'platform-cap-%d-%d-%d-%s',
            (int) $store->getId(),
            $store->getPlatformFeesPaidCents(),
            $chargeCents,
            $source,
        );
        $reference = $this->chargeFromSource(
            $store,
            $source,
            $chargeCents,
            $token,
            $verificationToken,
            $idempotencyKey,
            $buyer,
        );

        $this->feeRecorder->recordCollectedFee($store, $chargeCents);
        $store->setLastChargedAt(new \DateTimeImmutable());
        if ($store->hasMetPlatformCap() || $this->remainingCents($store) < 1) {
            $store->setPlanKey('flat');
            $store->markPlatformCapReached();
        }

        $this->entityManager->persist(SubscriptionCharge::paid($store, $chargeCents, $reference));

        return $chargeCents;
    }

    /**
     * @param array{email?: string, name?: string, reference?: string} $buyer
     */
    private function chargeFromSource(
        Store $store,
        string $source,
        int $amountCents,
        ?string $token,
        ?string $verificationToken,
        string $idempotencyKey,
        array $buyer,
    ): string {
        if (self::SOURCE_SQUARE === $source) {
            return $this->chargeSquare($store, $amountCents, $token, $verificationToken, $buyer);
        }
        if (self::SOURCE_PAYPAL === $source) {
            return $this->chargePaypal($store, $amountCents, $token, $idempotencyKey, $buyer);
        }

        return $this->chargeVaulted($store, $amountCents, $idempotencyKey);
    }

    /**
     * @param array{email?: string, name?: string, reference?: string} $buyer
     */
    private function chargeSquare(
        Store $store,
        int $amountCents,
        ?string $token,
        ?string $verificationToken,
        array $buyer,
    ): string {
        $connected = $this->isConnected($store, StorePaymentAccount::PROVIDER_SQUARE);
        $hasSquareVault = $this->hasVault($store) && Store::BILLING_PAYPAL !== $store->getBillingProvider();
        if (!$connected && !$hasSquareVault && (null === $token || '' === $token)) {
            throw new \InvalidArgumentException('Connect Square or save a card on file before charging Square.');
        }
        if (null !== $token && '' !== $token) {
            $result = $this->billing->startSubscription($token, $amountCents, $buyer, $verificationToken);

            return (string) ($result['reference'] ?? 'square');
        }
        if (!$hasSquareVault) {
            throw new \InvalidArgumentException('Enter a Square card to charge that account, or use the card on file.');
        }

        return $this->chargeVaulted($store, $amountCents, sprintf(
            'platform-cap-%d-%d-%d-square-vault',
            (int) $store->getId(),
            $store->getPlatformFeesPaidCents(),
            $amountCents,
        ));
    }

    /**
     * @param array{email?: string, name?: string, reference?: string} $buyer
     */
    private function chargePaypal(
        Store $store,
        int $amountCents,
        ?string $token,
        string $idempotencyKey,
        array $buyer,
    ): string {
        $connected = $this->isConnected($store, StorePaymentAccount::PROVIDER_PAYPAL);
        $hasPaypalVault = $this->hasVault($store) && Store::BILLING_PAYPAL === $store->getBillingProvider();
        if (!$connected && !$hasPaypalVault && (null === $token || '' === $token)) {
            throw new \InvalidArgumentException('Connect PayPal or save a PayPal method before charging PayPal.');
        }
        if (null !== $token && '' !== $token) {
            $result = $this->paypalBilling->startSubscription($token, $amountCents, $buyer);

            return (string) ($result['reference'] ?? 'paypal');
        }
        if (!$hasPaypalVault) {
            throw new \InvalidArgumentException('Approve PayPal to charge that account, or use the card on file.');
        }

        return $this->chargeVaulted($store, $amountCents, $idempotencyKey);
    }

    private function chargeVaulted(Store $store, int $amountCents, string $idempotencyKey): string
    {
        $customerId = $store->getPaymentCustomerId();
        $cardId = $store->getPaymentCardId();
        $usingPaypal = Store::BILLING_PAYPAL === $store->getBillingProvider();
        $processorLive = $usingPaypal ? $this->paypalBilling->isLive() : $this->billing->isLive();
        if ($processorLive && (null === $customerId || '' === $customerId || null === $cardId || '' === $cardId)) {
            throw new \InvalidArgumentException('Save a platform payment method before paying toward the cap.');
        }

        if ($usingPaypal) {
            $result = $this->paypalBilling->chargeVaultedCard(
                (string) $customerId,
                (string) $cardId,
                $amountCents,
                $idempotencyKey,
            );
        } else {
            $result = $this->billing->chargeVaultedCard(
                (string) $customerId,
                (string) $cardId,
                $amountCents,
                $idempotencyKey,
            );
        }

        return (string) ($result['reference'] ?? $idempotencyKey);
    }

    private function hasVault(Store $store): bool
    {
        $cardId = $store->getPaymentCardId();

        return null !== $cardId && '' !== $cardId;
    }

    private function isConnected(Store $store, string $provider): bool
    {
        $account = $this->accounts->findOneForStoreAndProvider($store, $provider);

        return $account instanceof StorePaymentAccount
            && StorePaymentAccount::STATUS_CONNECTED === $account->getStatus();
    }
}
