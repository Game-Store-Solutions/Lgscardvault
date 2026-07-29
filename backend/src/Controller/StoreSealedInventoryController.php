<?php

namespace App\Controller;

use App\Entity\SealedInventoryItem;
use App\Entity\Store;
use App\Repository\SealedInventoryItemRepository;
use App\Repository\SealedProductRepository;
use App\Repository\StoreRepository;
use App\Service\Catalog\GameCatalogSerializer;
use App\Service\Inventory\SealedInventoryService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Store sealed inventory:
 *  - public storefront reads (/sealed) show in-stock lines only;
 *  - staff manage lines under /sealed-inventory (STORE_MANAGE).
 */
#[Route('/api/stores/{slug}')]
final class StoreSealedInventoryController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly SealedProductRepository $sealedProducts,
        private readonly SealedInventoryItemRepository $items,
        private readonly SealedInventoryService $inventory,
        private readonly GameCatalogSerializer $serializer,
    ) {
    }

    /** Public: in-stock sealed lines, optionally one game (?game=code). */
    #[Route('/sealed', name: 'api_store_sealed_public', methods: ['GET'])]
    public function publicList(Request $request, string $slug): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $gameCode = trim((string) $request->query->get('game', ''));
        $items = $this->items->findForStore($store, '' !== $gameCode ? $gameCode : null, inStockOnly: true);

        return $this->json(array_map($this->serializer->sealedInventoryItem(...), $items));
    }

    /** Public: freshest in-stock sealed lines for the spotlight (?game=code). */
    #[Route('/sealed/spotlight', name: 'api_store_sealed_spotlight', methods: ['GET'])]
    public function spotlight(Request $request, string $slug): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $gameCode = trim((string) $request->query->get('game', ''));

        return $this->json(array_map(
            $this->serializer->sealedInventoryItem(...),
            $this->items->findSpotlightForStore($store, gameCode: '' !== $gameCode ? $gameCode : null),
        ));
    }

    /** Staff: every line including sold-out (?game=code to narrow). */
    #[Route('/sealed-inventory', name: 'api_store_sealed_inventory_list', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function list(Request $request, string $slug): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $gameCode = trim((string) $request->query->get('game', ''));
        $items = $this->items->findForStore($store, '' !== $gameCode ? $gameCode : null);

        return $this->json(array_map($this->serializer->sealedInventoryItem(...), $items));
    }

    /** Staff: add stock of a catalog sealed product (folds into the line). */
    #[Route('/sealed-inventory', name: 'api_store_sealed_inventory_add', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function add(Request $request, string $slug): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Invalid JSON body.'], 400);
        }

        $productId = (int) ($payload['sealedProductId'] ?? 0);
        $product = $productId > 0 ? $this->sealedProducts->find($productId) : null;
        if (null === $product) {
            return $this->json(['detail' => 'Unknown sealed product.'], 404);
        }

        $quantity = (int) ($payload['quantity'] ?? 1);
        if ($quantity < 1) {
            return $this->json(['detail' => 'Quantity must be at least 1.'], 422);
        }

        $item = $this->inventory->add(
            $store,
            $product,
            $quantity,
            $this->optionalCents($payload, 'priceCents'),
            $this->optionalCents($payload, 'acquisitionCostCents'),
        );

        return $this->json($this->serializer->sealedInventoryItem($item), 201);
    }

    /** Staff: adjust quantity/price on a line. */
    #[Route('/sealed-inventory/{id}', name: 'api_store_sealed_inventory_update', methods: ['PATCH'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function update(Request $request, string $slug, int $id): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $item = $this->items->findOneForStore($store, $id);
        if (!$item instanceof SealedInventoryItem) {
            return $this->json(['detail' => 'Sealed inventory line not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Invalid JSON body.'], 400);
        }

        $quantity = array_key_exists('quantity', $payload) ? (int) $payload['quantity'] : null;
        if (null !== $quantity && $quantity < 0) {
            return $this->json(['detail' => 'Quantity cannot be negative.'], 422);
        }

        $item = $this->inventory->update(
            $item,
            $quantity,
            $this->optionalCents($payload, 'priceCents'),
            $this->optionalCents($payload, 'acquisitionCostCents'),
        );

        return $this->json($this->serializer->sealedInventoryItem($item));
    }

    /** Staff: remove a line entirely. */
    #[Route('/sealed-inventory/{id}', name: 'api_store_sealed_inventory_delete', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function delete(string $slug, int $id): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $item = $this->items->findOneForStore($store, $id);
        if (!$item instanceof SealedInventoryItem) {
            return $this->json(['detail' => 'Sealed inventory line not found.'], 404);
        }

        $this->inventory->remove($item);

        return $this->json(null, 204);
    }

    private function findManagedStore(string $slug): ?Store
    {
        $store = $this->stores->findOneBySlug($slug);
        if (null === $store) {
            return null;
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $store;
    }

    /** @param array<string, mixed> $payload */
    private function optionalCents(array $payload, string $key): ?int
    {
        if (!array_key_exists($key, $payload) || null === $payload[$key]) {
            return null;
        }

        return max(0, (int) $payload[$key]);
    }
}
