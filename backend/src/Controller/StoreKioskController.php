<?php

namespace App\Controller;

use App\Repository\StoreRepository;
use App\Service\Store\StoreSettingsUpdater;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/stores/{slug}/kiosk')]
class StoreKioskController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly StoreSettingsUpdater $settingsUpdater,
    ) {
    }

    /**
     * Confirm the store's kiosk exit code so a locked terminal can leave
     * customer-facing mode. Requires store manage; never returns the code.
     */
    #[Route('/verify-exit', name: 'api_store_kiosk_verify_exit', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function verifyExit(string $slug, Request $request): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            throw new NotFoundHttpException(sprintf('Store "%s" not found.', $slug));
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        if (!$store->isKioskExitCodeSet()) {
            // Legacy terminals / misconfigured stores: manage access alone can leave.
            return $this->json(['ok' => true]);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $code = is_string($payload['code'] ?? null) ? (string) $payload['code'] : '';

        if (!$this->settingsUpdater->verifyKioskExitCode($store, $code)) {
            return $this->json(['detail' => 'Incorrect exit code.'], Response::HTTP_FORBIDDEN);
        }

        return $this->json(['ok' => true]);
    }
}
