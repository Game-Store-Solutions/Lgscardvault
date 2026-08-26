<?php

namespace App\Controller;

use App\Entity\Store;
use App\Entity\User;
use App\Repository\StoreRepository;
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

        $plan = $store->getPlanKey() ? $this->planCatalog->find($store->getPlanKey()) : null;
        $priceCents = (int) ($plan['priceCents'] ?? 0);

        return $this->json([
            'planKey' => $store->getPlanKey(),
            'planName' => $plan['name'] ?? null,
            'priceCents' => $priceCents,
            'subscriptionStatus' => $store->getSubscriptionStatus(),
            'paymentMethodType' => $store->getPaymentMethodType(),
            'paymentLast4' => $store->getPaymentLast4(),
            'paymentConfigured' => 0 === $priceCents || null !== $store->getPaymentCardId(),
            'currentPeriodEnd' => $store->getCurrentPeriodEnd()?->format(\DATE_ATOM),
            'lastChargedAt' => $store->getLastChargedAt()?->format(\DATE_ATOM),
            'failedAttempts' => $store->getBillingAttempts(),
            'nextAttemptAt' => $store->getNextAttemptAt()?->format(\DATE_ATOM),
            'billingProvider' => $store->getBillingProvider(),
        ] + $this->billing->clientConfig() + ['paypal' => $this->paypalBilling->clientConfig()]);
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
    public function paypalOrder(string $slug): JsonResponse
    {
        $store = $this->resolveManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        $plan = $store->getPlanKey() ? $this->planCatalog->find($store->getPlanKey()) : null;
        $priceCents = (int) ($plan['priceCents'] ?? 0);
        if ($priceCents <= 0) {
            return $this->json(['error' => 'This plan does not require PayPal.'], Response::HTTP_BAD_REQUEST);
        }

        $user = $this->getUser();
        $email = $user instanceof User ? $user->getEmail() : null;

        try {
            // $0.01 capture vaults PayPal for renewals without collecting a full period early.
            $orderId = $this->paypalBilling->createOrder(1, 'sub-'.($store->getSlug() ?? 'store'), $email);
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
}
