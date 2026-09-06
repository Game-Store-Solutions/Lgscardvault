<?php

namespace App\Controller;

use App\Repository\StoreRepository;
use App\Service\Inventory\StoreInventoryClearer;
use App\Service\Store\StoreSettingsUpdater;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/stores/{slug}/settings')]
class StoreSettingsController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly StoreSettingsUpdater $settingsUpdater,
        private readonly StoreInventoryClearer $inventoryClearer,
    ) {
    }

    #[Route('', name: 'api_store_settings_update', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function update(string $slug, Request $request): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            throw new NotFoundHttpException(sprintf('Store "%s" not found.', $slug));
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];

        try {
            $this->settingsUpdater->update($store, $payload);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        return $this->json($this->settingsUpdater->serialize($store));
    }

    /**
     * Permanently delete every singles and sealed listing. Requires
     * `{ "confirmSlug": "<slug>" }` so a mis-click cannot empty the store.
     */
    #[Route('/clear-inventory', name: 'api_store_settings_clear_inventory', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function clearInventory(string $slug, Request $request): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            throw new NotFoundHttpException(sprintf('Store "%s" not found.', $slug));
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $confirmSlug = trim((string) ($payload['confirmSlug'] ?? ''));
        if ($confirmSlug !== $store->getSlug()) {
            return $this->json([
                'detail' => 'Type the store slug to confirm deleting all inventory.',
            ], 422);
        }

        return $this->json($this->inventoryClearer->clear($store));
    }
}
