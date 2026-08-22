<?php

namespace App\Controller;

use App\Entity\Store;
use App\Entity\SubscriptionCharge;
use App\Entity\User;
use App\Entity\ComplianceDocument;
use App\Repository\StoreRepository;
use App\Repository\UserRepository;
use App\Service\Compliance\StoreComplianceGate;
use App\Service\Onboarding\AddressAutocompleteClient;
use App\Service\Onboarding\PlanCatalog;
use App\Service\Onboarding\UsRegion;
use App\Service\Payments\SubscriptionBillingInterface;
use App\Service\Store\StoreSettingsUpdater;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Self-serve store onboarding. The owner creates their account (via /register),
 * then walks the wizard and submits here to create a PENDING store. A platform
 * admin approves it afterwards, which activates the storefront.
 */
#[Route('/api')]
class OnboardingController extends AbstractController
{
    private const SLUG_MAX = 64;

    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly UserRepository $userRepository,
        private readonly EntityManagerInterface $entityManager,
        private readonly PlanCatalog $planCatalog,
        private readonly AddressAutocompleteClient $addressClient,
        private readonly SubscriptionBillingInterface $billing,
        private readonly StoreSettingsUpdater $settingsUpdater,
    ) {
    }

    #[Route('/geocode/search', name: 'api_geocode_search', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function geocode(Request $request): JsonResponse
    {
        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $query = isset($payload['query']) ? (string) $payload['query'] : '';
        $country = isset($payload['country']) ? (string) $payload['country'] : null;

        return $this->json(['suggestions' => $this->addressClient->search($query, $country)]);
    }

    #[Route('/payments/onboarding/client-config', name: 'api_onboarding_payment_config', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function paymentConfig(): JsonResponse
    {
        return $this->json($this->billing->clientConfig());
    }

    #[Route('/onboarding/store', name: 'api_onboarding_store', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function submit(Request $request): JsonResponse
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            return $this->json(['error' => 'Authentication required.'], Response::HTTP_UNAUTHORIZED);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];

        $name = trim((string) ($payload['name'] ?? ''));
        $slug = strtolower(trim((string) ($payload['slug'] ?? '')));
        $planKey = (string) ($payload['planKey'] ?? '');

        // --- Validation ---
        if ('' === $name) {
            return $this->json(['error' => 'Store name is required.'], Response::HTTP_BAD_REQUEST);
        }
        if (!preg_match('/^[a-z0-9-]+$/', $slug)) {
            return $this->json(['error' => 'Slug must be lowercase alphanumeric with hyphens.'], Response::HTTP_BAD_REQUEST);
        }
        if (mb_strlen($slug) > self::SLUG_MAX) {
            return $this->json(['error' => sprintf('Slug must be %d characters or fewer.', self::SLUG_MAX)], Response::HTTP_BAD_REQUEST);
        }
        if ($this->storeRepository->findOneBySlug($slug)) {
            return $this->json(['error' => 'That store address is already taken.'], Response::HTTP_CONFLICT);
        }

        $plan = $this->planCatalog->find($planKey);
        if (null === $plan) {
            return $this->json(['error' => 'Select a valid plan.'], Response::HTTP_BAD_REQUEST);
        }

        $address = is_array($payload['address'] ?? null) ? $payload['address'] : [];
        foreach (['addressLine1', 'city', 'postalCode', 'country'] as $required) {
            if ('' === trim((string) ($address[$required] ?? ''))) {
                return $this->json(['error' => 'A complete business address is required.'], Response::HTTP_BAD_REQUEST);
            }
        }

        $country = strtoupper(trim((string) ($address['country'] ?? '')));
        if ('US' !== $country) {
            return $this->json(['error' => 'Stores must be located in the United States.'], Response::HTTP_BAD_REQUEST);
        }
        $region = UsRegion::normalize((string) ($address['region'] ?? ''));
        if (null === $region) {
            return $this->json(['error' => 'A valid U.S. state is required.'], Response::HTTP_BAD_REQUEST);
        }
        $address['region'] = $region;
        $address['country'] = 'US';
        if (!$this->isTruthy($payload['acceptedMerchantTerms'] ?? false)) {
            return $this->json(['error' => 'You must accept the merchant terms to open a store.'], Response::HTTP_BAD_REQUEST);
        }

        $complianceRaw = is_array($payload['compliance'] ?? null) ? $payload['compliance'] : [];
        $compliance = StoreComplianceGate::normalize($complianceRaw);

        // --- Payment input (paid tiers only) ---
        $priceCents = (int) ($plan['priceCents'] ?? 0);
        $payment = is_array($payload['payment'] ?? null) ? $payload['payment'] : [];
        $methodType = (string) ($payment['methodType'] ?? '');
        $sourceId = (string) ($payment['token'] ?? '');
        $verificationToken = $this->nullableString($payment['verificationToken'] ?? null, 1024);

        if ($priceCents > 0) {
            if (!in_array($methodType, SubscriptionBillingInterface::METHODS, true)) {
                return $this->json(['error' => 'Choose a payment method to continue.'], Response::HTTP_BAD_REQUEST);
            }
            if ('' === $sourceId) {
                return $this->json(['error' => 'Payment could not be verified. Please try again.'], Response::HTTP_BAD_REQUEST);
            }
        }

        // --- Build the pending store ---
        $store = (new Store())
            ->setName($name)
            ->setSlug($slug)
            ->setOwner($user)
            ->setIsActive(false)
            ->setStatus(Store::STATUS_PENDING)
            ->setPlanKey($planKey)
            ->setPaymentMethodType($priceCents > 0 ? $methodType : null)
            ->setPaymentLast4($this->nullableString($payment['last4'] ?? null, 8))
            ->setAddressLine1($this->nullableString($address['addressLine1'] ?? null))
            ->setAddressLine2($this->nullableString($address['addressLine2'] ?? null))
            ->setCity($this->nullableString($address['city'] ?? null))
            ->setRegion($this->nullableString($address['region'] ?? null))
            ->setPostalCode($this->nullableString($address['postalCode'] ?? null, 32))
            ->setCountry($this->nullableString(strtoupper((string) ($address['country'] ?? '')) ?: null, 2))
            ->setPhone($this->nullableString($payload['phone'] ?? null, 32))
            ->setLatitude(isset($address['latitude']) && is_numeric($address['latitude']) ? (float) $address['latitude'] : null)
            ->setLongitude(isset($address['longitude']) && is_numeric($address['longitude']) ? (float) $address['longitude'] : null)
            ->setCompliance($compliance);

        $documentError = $this->attachComplianceDocuments($store, $user, $payload['documentIds'] ?? []);
        if (null !== $documentError) {
            return $this->json(['error' => $documentError], Response::HTTP_BAD_REQUEST);
        }
        $complianceErrors = StoreComplianceGate::errors($store);
        if ($complianceErrors !== []) {
            return $this->json(['error' => $complianceErrors[0]], Response::HTTP_BAD_REQUEST);
        }

        // Branding — same validation as the store-admin settings endpoint.
        $branding = is_array($payload['branding'] ?? null) ? $payload['branding'] : [];
        try {
            $this->settingsUpdater->applyBranding($store, $branding);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        // --- Charge only after everything else validated ---
        try {
            $subscription = $this->billing->startSubscription(
                $sourceId,
                $priceCents,
                [
                    'email' => $user->getEmail(),
                    'name' => $user->getDisplayName(),
                    'reference' => $slug,
                ],
                $verificationToken,
            );
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }

        $store->setSubscriptionStatus($subscription['status'])
            ->setPaymentReference($subscription['reference'])
            ->setPaymentCustomerId($subscription['customerId'])
            ->setPaymentCardId($subscription['cardId']);

        // The first period is paid; renewals only become due once it lapses.
        // Free tiers keep a null period end so the renewer never selects them.
        if ($priceCents > 0) {
            $store->markSubscriptionCharged(new \DateTimeImmutable());
            $this->entityManager->persist(SubscriptionCharge::paid($store, $priceCents, $subscription['reference']));
        }

        // Prefer the processor's own card details over anything the browser sent.
        if (null !== $subscription['last4']) {
            $store->setPaymentLast4($subscription['last4']);
        }

        $this->entityManager->persist($store);

        // Ensure the submitter carries the owner role (they may have registered as a customer).
        $roles = $user->getRoles();
        if (!in_array('ROLE_STORE_OWNER', $roles, true)) {
            $roles[] = 'ROLE_STORE_OWNER';
            $user->setRoles(array_values(array_filter($roles, static fn (string $r): bool => 'ROLE_USER' !== $r)));
        }

        $this->entityManager->flush();

        return $this->json([
            'id' => $store->getId(),
            'name' => $store->getName(),
            'slug' => $store->getSlug(),
            'status' => $store->getStatus(),
            'planKey' => $store->getPlanKey(),
        ], Response::HTTP_CREATED);
    }

    private function nullableString(mixed $value, ?int $maxLength = null): ?string
    {
        if (null === $value) {
            return null;
        }
        $trimmed = trim((string) $value);
        if ('' === $trimmed) {
            return null;
        }

        return null !== $maxLength ? mb_substr($trimmed, 0, $maxLength) : $trimmed;
    }

    private function isTruthy(mixed $value): bool
    {
        if (true === $value || 1 === $value || '1' === $value) {
            return true;
        }

        return is_string($value) && \in_array(strtolower($value), ['true', 'yes', 'on'], true);
    }

    /**
     * @param mixed $documentIds
     */
    private function attachComplianceDocuments(Store $store, User $user, mixed $documentIds): ?string
    {
        if (!is_array($documentIds) || [] === $documentIds) {
            return null;
        }

        foreach ($documentIds as $id) {
            if (!is_numeric($id)) {
                continue;
            }
            $document = $this->entityManager->find(ComplianceDocument::class, (int) $id);
            if (!$document instanceof ComplianceDocument || $document->getOwner()->getId() !== $user->getId()) {
                return 'Unknown compliance document.';
            }
            if (null !== $document->getStore() && $document->getStore() !== $store) {
                return 'That document belongs to another store.';
            }
            $document->setStore($store);
            if (!$store->getComplianceDocuments()->contains($document)) {
                $store->getComplianceDocuments()->add($document);
            }
        }

        return null;
    }
}
