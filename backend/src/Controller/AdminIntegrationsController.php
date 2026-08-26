<?php

namespace App\Controller;

use App\Service\Auth\OidcClient;
use App\Service\Onboarding\AddressAutocompleteClient;
use App\Service\Payments\PaypalCredentials;
use App\Service\Payments\PaypalSubscriptionBilling;
use App\Service\Payments\SquareCredentials;
use App\Service\Payments\SubscriptionBillingInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * A read-only snapshot of which optional integrations are wired up, so the
 * platform admin can see at a glance what's configured. The actual credentials
 * live in backend/.env.local (see the SSO/payments/geocode env keys).
 */
#[Route('/api/admin')]
#[IsGranted('ROLE_SUPER_ADMIN')]
class AdminIntegrationsController extends AbstractController
{
    public function __construct(
        private readonly OidcClient $oidc,
        private readonly AddressAutocompleteClient $addressClient,
        private readonly SubscriptionBillingInterface $billing,
        private readonly PaypalSubscriptionBilling $paypalBilling,
        private readonly SquareCredentials $credentials,
        private readonly PaypalCredentials $paypalCredentials,
    ) {
    }

    #[Route('/integrations', name: 'api_admin_integrations', methods: ['GET'])]
    public function index(): JsonResponse
    {
        return $this->json([
            'sso' => [
                'configured' => $this->oidc->isConfigured(),
                'providerName' => $this->oidc->providerName(),
                'envKeys' => ['SSO_OIDC_ISSUER', 'SSO_OIDC_CLIENT_ID', 'SSO_OIDC_CLIENT_SECRET'],
            ],
            'addressAutocomplete' => [
                'configured' => $this->addressClient->isConfigured(),
                'provider' => 'Mapbox',
                'envKeys' => ['MAPBOX_ACCESS_TOKEN'],
            ],
            'subscriptionPayments' => [
                'configured' => $this->billing->isLive(),
                'mode' => $this->billing->isLive() ? 'square' : 'mock',
                'provider' => 'Square',
                'envKeys' => $this->credentials->envKeys(),
            ],
            'paypal' => [
                'configured' => $this->paypalBilling->isLive(),
                'mode' => $this->paypalBilling->isLive() ? 'paypal' : 'mock',
                'provider' => 'PayPal',
                'envKeys' => $this->paypalCredentials->envKeys(),
            ],
        ]);
    }
}
