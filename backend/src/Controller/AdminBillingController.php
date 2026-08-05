<?php

namespace App\Controller;

use App\Entity\Store;
use App\Entity\SubscriptionCharge;
use App\Repository\StoreRepository;
use App\Repository\SubscriptionChargeRepository;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Payments\SubscriptionRenewer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Platform-side view of what store owners pay the marketplace each month.
 *
 * Answers the two questions an operator actually has: what did we collect, and
 * who is behind. Card details are never exposed beyond the last four digits,
 * and the processor customer/card ids stay server-side entirely.
 */
#[Route('/api/admin/billing')]
#[IsGranted('ROLE_SUPER_ADMIN')]
final class AdminBillingController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly SubscriptionChargeRepository $charges,
        private readonly PlanCatalog $plans,
        private readonly SubscriptionRenewer $renewer,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('', name: 'api_admin_billing', methods: ['GET'])]
    public function index(): JsonResponse
    {
        $now = new \DateTimeImmutable();
        $subscriptions = [];
        $mrrCents = 0;
        $overdueCents = 0;
        $counts = ['active' => 0, 'past_due' => 0, 'suspended' => 0, 'free' => 0];

        foreach ($this->stores->findAll() as $store) {
            $priceCents = $this->priceCents($store);
            $status = $store->getSubscriptionStatus();

            // Free and never-subscribed stores are not billing relationships;
            // listing them would bury the handful that need attention.
            if ($priceCents <= 0) {
                if (null !== $store->getPlanKey()) {
                    ++$counts['free'];
                }
                continue;
            }

            if (isset($counts[$status])) {
                ++$counts[$status];
            }

            if (Store::SUBSCRIPTION_ACTIVE === $status) {
                $mrrCents += $priceCents;
            }
            if (in_array($status, [Store::SUBSCRIPTION_PAST_DUE, Store::SUBSCRIPTION_SUSPENDED], true)) {
                $overdueCents += $priceCents;
            }

            $subscriptions[] = [
                'slug' => $store->getSlug(),
                'name' => $store->getName(),
                'planKey' => $store->getPlanKey(),
                'priceCents' => $priceCents,
                'subscriptionStatus' => $status,
                'isActive' => $store->isActive(),
                'paymentMethodType' => $store->getPaymentMethodType(),
                'paymentLast4' => $store->getPaymentLast4(),
                'hasCardOnFile' => null !== $store->getPaymentCardId(),
                'currentPeriodEnd' => $store->getCurrentPeriodEnd()?->format(\DATE_ATOM),
                'lastChargedAt' => $store->getLastChargedAt()?->format(\DATE_ATOM),
                'failedAttempts' => $store->getBillingAttempts(),
                'nextAttemptAt' => $store->getNextAttemptAt()?->format(\DATE_ATOM),
                'isOverdue' => $store->isRenewalDue($now),
                'ownerEmail' => $store->getOwner()?->getEmail(),
            ];
        }

        // Soonest renewal first: the top of the table is what happens next.
        usort($subscriptions, static function (array $a, array $b): int {
            return ($a['currentPeriodEnd'] ?? '9999') <=> ($b['currentPeriodEnd'] ?? '9999');
        });

        return $this->json([
            'summary' => [
                'mrrCents' => $mrrCents,
                'overdueCents' => $overdueCents,
                'collectedThisMonthCents' => $this->charges->collectedThisMonthCents(),
                'activeCount' => $counts['active'],
                'pastDueCount' => $counts['past_due'],
                'suspendedCount' => $counts['suspended'],
                'freeCount' => $counts['free'],
                'dueCount' => count(array_filter($subscriptions, static fn (array $s): bool => $s['isOverdue'])),
            ],
            'months' => $this->charges->monthlyTotals(6),
            'subscriptions' => $subscriptions,
            'recentCharges' => array_map($this->serializeCharge(...), $this->charges->findRecent(25)),
        ]);
    }

    /**
     * Collect one store now instead of waiting for tonight's run — the usual
     * follow-up after an owner says they have fixed their card.
     *
     * Safe to press twice: the renewer keys each attempt so the processor
     * collapses a repeat into the original charge.
     */
    #[Route('/{slug}/retry', name: 'api_admin_billing_retry', methods: ['POST'])]
    public function retry(string $slug): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        if ($this->priceCents($store) <= 0) {
            return $this->json(['detail' => 'This store is on a free plan.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }
        if (null === $store->getPaymentCardId()) {
            return $this->json(['detail' => 'This store has no card on file.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // Clear any dunning backoff and bring the due date forward so this
        // store is picked up by the run below even if it is mid-cycle.
        $store->setNextAttemptAt(null);
        if (Store::SUBSCRIPTION_SUSPENDED === $store->getSubscriptionStatus()) {
            $store->setSubscriptionStatus(Store::SUBSCRIPTION_PAST_DUE);
        }
        if (!$store->isRenewalDue(new \DateTimeImmutable())) {
            $store->setCurrentPeriodEnd(new \DateTimeImmutable('-1 second'));
        }
        $this->entityManager->flush();

        $results = $this->renewer->run();
        $result = null;
        foreach ($results as $candidate) {
            if ($candidate['slug'] === $slug) {
                $result = $candidate;
                break;
            }
        }

        return $this->json([
            'outcome' => $result['outcome'] ?? 'skipped',
            'detail' => $result['detail'] ?? 'Nothing was due for this store.',
            'subscriptionStatus' => $store->getSubscriptionStatus(),
            'currentPeriodEnd' => $store->getCurrentPeriodEnd()?->format(\DATE_ATOM),
        ]);
    }

    /** @return array<string, mixed> */
    private function serializeCharge(SubscriptionCharge $charge): array
    {
        return [
            'id' => $charge->getId(),
            'storeSlug' => $charge->getStore()?->getSlug(),
            'storeName' => $charge->getStore()?->getName(),
            'planKey' => $charge->getPlanKey(),
            'amountCents' => $charge->getAmountCents(),
            'status' => $charge->getStatus(),
            'reference' => $charge->getReference(),
            'failureReason' => $charge->getFailureReason(),
            'attempt' => $charge->getAttempt(),
            'createdAt' => $charge->getCreatedAt()->format(\DATE_ATOM),
        ];
    }

    private function priceCents(Store $store): int
    {
        $planKey = $store->getPlanKey();
        if (null === $planKey || '' === $planKey) {
            return 0;
        }

        return (int) ($this->plans->find($planKey)['priceCents'] ?? 0);
    }
}
