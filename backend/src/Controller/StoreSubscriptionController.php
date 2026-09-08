<?php

namespace App\Controller;

use App\Entity\Store;
use App\Entity\User;
use App\Repository\StoreRepository;
use App\Service\Billing\PlatformPlanBuyout;
use App\Service\Billing\PlatformSubscriptionStatus;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\PaypalSubscriptionBilling;
use App\Service\Payments\SubscriptionBillingInterface;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * The store owner's subscription to the platform (Square, platform as merchant).
 * Separate from StorePaymentController, which connects the store's own Square
 * account so it can charge its shoppers.
 */
#[Route('/api/stores/{slug}/subscription')]
final class StoreSubscriptionController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly PlanCatalog $planCatalog,
        private readonly PlatformSubscriptionStatus $subscriptionStatus,
        private readonly PlatformPlanBuyout $planBuyout,
        private readonly SubscriptionBillingInterface $billing,
        private readonly PaypalSubscriptionBilling $paypalBilling,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('', name: 'api_store_subscription_status', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function status(string $slug): JsonResponse
    {
        $store = $this->resolveManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->subscriptionStatus->toArray($store));
    }

    #[Route('/buyout', name: 'api_store_subscription_buyout', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function buyout(string $slug, Request $request): JsonResponse
    {
        $store = $this->resolveManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $amountCents = $this->optionalAmountCents($payload['amountCents'] ?? null);
        if (false === $amountCents) {
            return $this->json(['error' => 'Enter a valid dollar amount.'], Response::HTTP_BAD_REQUEST);
        }

        $source = strtolower(trim((string) ($payload['source'] ?? PlatformPlanBuyout::SOURCE_VAULT)));
        if (!in_array($source, PlatformPlanBuyout::SOURCES, true)) {
            return $this->json(['error' => 'Choose Square, PayPal, or the card on file.'], Response::HTTP_BAD_REQUEST);
        }
        $token = $this->nullableString($payload['token'] ?? null);
        $verificationToken = $this->nullableString($payload['verificationToken'] ?? null);
        $user = $this->getUser();
        $buyer = $user instanceof User
            ? [
                'email' => $user->getEmail(),
                'name' => $user->getDisplayName(),
                'reference' => (string) $store->getSlug(),
            ]
            : [];

        try {
            $chargedCents = $this->planBuyout->execute($store, $amountCents, $source, $token, $verificationToken, $buyer);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }

        $this->entityManager->flush();

        return $this->json($this->subscriptionStatus->toArray($store) + [
            'chargedCents' => $chargedCents,
        ]);
    }

    #[Route('/payment-method', name: 'api_store_subscription_payment_method', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function updatePaymentMethod(string $slug, Request $request): JsonResponse
    {
        $store = $this->resolveManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $methodType = (string) ($payload['methodType'] ?? '');
        $sourceId = (string) ($payload['token'] ?? '');
        $verificationToken = $this->nullableString($payload['verificationToken'] ?? null);

        if (!in_array($methodType, SubscriptionBillingInterface::METHODS, true)) {
            return $this->json(['error' => 'Choose a valid payment method.'], Response::HTTP_BAD_REQUEST);
        }
        if ('' === $sourceId) {
            return $this->json(['error' => 'Payment could not be verified.'], Response::HTTP_BAD_REQUEST);
        }

        $customerId = $store->getPaymentCustomerId();
        if ($this->billing->isLive() && (null === $customerId || '' === $customerId)) {
            return $this->json(
                ['error' => 'This store has no billing profile yet. Choose a paid plan first.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        try {
            if ('paypal' === $methodType) {
                $card = $this->paypalBilling->replaceVaultedCard(
                    (string) $customerId,
                    $store->getPaymentCardId(),
                    $sourceId,
                    $verificationToken,
                );
                $store->setBillingProvider(Store::BILLING_PAYPAL);
            } else {
                $card = $this->billing->replaceVaultedCard(
                    (string) $customerId,
                    $store->getPaymentCardId(),
                    $sourceId,
                    $verificationToken,
                );
                $store->setBillingProvider(Store::BILLING_SQUARE);
            }
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }

        $store
            ->setPaymentMethodType($methodType)
            ->setPaymentCardId($card['cardId'])
            ->setPaymentLast4($card['last4']);

        // A new card is the fix for a failed renewal, so drop the dunning
        // backoff and let the next run retry immediately. Suspended stores are
        // revived here too — the owner has done the one thing that was needed.
        if (in_array($store->getSubscriptionStatus(), [Store::SUBSCRIPTION_PAST_DUE, Store::SUBSCRIPTION_SUSPENDED], true)) {
            $store->setSubscriptionStatus(Store::SUBSCRIPTION_PAST_DUE)
                ->setNextAttemptAt(null);
        }

        $this->entityManager->flush();

        return $this->json([
            'paymentMethodType' => $store->getPaymentMethodType(),
            'paymentLast4' => $store->getPaymentLast4(),
            'subscriptionStatus' => $store->getSubscriptionStatus(),
        ]);
    }

    #[Route('/paypal/order', name: 'api_store_subscription_paypal_order', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function paypalOrder(string $slug, Request $request): JsonResponse
    {
        $store = $this->resolveManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        if (!$this->planCatalog->requiresPaymentMethod($store->getPlanKey())) {
            return $this->json(['error' => 'This plan does not require PayPal.'], Response::HTTP_BAD_REQUEST);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $amountCents = (int) ($payload['amountCents'] ?? 1);
        if ($amountCents < 1) {
            $amountCents = 1;
        }
        // Cap payments cannot exceed what is left toward the platform cap.
        // $0.01 vaulting (default) stays as-is when remaining is 0 on flat plans.
        $remaining = $this->planBuyout->remainingCents($store);
        if ($remaining > 0 && $amountCents > $remaining) {
            $amountCents = $remaining;
        }

        $user = $this->getUser();
        $email = $user instanceof User ? $user->getEmail() : null;

        try {
            // $0.01 capture vaults PayPal; larger amounts collect a cap payment.
            $orderId = $this->paypalBilling->createOrder($amountCents, 'sub-'.($store->getSlug() ?? 'store'), $email);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }

        return $this->json(['orderId' => $orderId]);
    }

    private function resolveManagedStore(string $slug): ?Store
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return null;
        }

        if (!$this->getUser() instanceof User) {
            return null;
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $store;
    }

    private function nullableString(mixed $value): ?string
    {
        if (null === $value) {
            return null;
        }
        $trimmed = trim((string) $value);

        return '' !== $trimmed ? $trimmed : null;
    }

    /**
     * null = pay remaining cap. false = the client sent a non-numeric amount.
     *
     * @return int|null|false
     */
    private function optionalAmountCents(mixed $value): int|null|false
    {
        if (null === $value || '' === $value) {
            return null;
        }
        if (is_int($value)) {
            return $value;
        }
        if (is_float($value) || (is_string($value) && is_numeric($value))) {
            return (int) $value;
        }

        return false;
    }
}
