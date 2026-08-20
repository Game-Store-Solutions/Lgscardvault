<?php

namespace App\Controller;

use App\Entity\Store;
use App\Repository\InventoryItemRepository;
use App\Repository\StoreRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Public mass search: match a pasted decklist against one store's in-stock
 * singles without walking the whole catalog. The storefront used to download
 * every listing (500×N pages) before Search was even clickable.
 */
#[Route('/api/stores/{slug}/inventory')]
final class StoreMassSearchController extends AbstractController
{
    public const MAX_NAMES = 400;

    /**
     * Same drop-list as the inventory collection: tiles need identity, a
     * thumbnail, and prices — not oracle text or per-face dumps.
     *
     * @var list<string>
     */
    private const LIST_IGNORED_ATTRIBUTES = [
        'legalities',
        'flavorText',
        'cardFaces',
        'scryfallUri',
        'oracleText',
        'keywords',
        'power',
        'toughness',
        'loyalty',
        'layout',
        'lang',
        'cmc',
        'manaCost',
    ];

    public function __construct(
        private readonly StoreRepository $stores,
        private readonly InventoryItemRepository $inventory,
    ) {
    }

    #[Route('/mass-search', name: 'api_store_inventory_mass_search', methods: ['POST'])]
    public function search(Request $request, string $slug): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        try {
            $payload = $request->toArray();
        } catch (\Throwable) {
            return $this->json(['detail' => 'Request body must be JSON.'], 400);
        }

        $raw = $payload['names'] ?? null;
        if (!\is_array($raw)) {
            return $this->json(['detail' => 'Provide a names array of card names.'], 422);
        }

        if (\count($raw) > self::MAX_NAMES) {
            return $this->json(
                ['detail' => sprintf('Search at most %d unique card names at a time.', self::MAX_NAMES)],
                422,
            );
        }

        $names = [];
        foreach ($raw as $value) {
            if (!\is_string($value) && !\is_int($value) && !\is_float($value)) {
                continue;
            }
            $name = mb_strtolower(trim((string) $value));
            if ('' === $name) {
                continue;
            }
            $names[$name] = mb_substr($name, 0, 200);
        }

        $items = $this->inventory->findInStockByCardNames($store, array_values($names));

        return $this->json($items, 200, [], [
            'groups' => ['inventory:read'],
            'ignored_attributes' => self::LIST_IGNORED_ATTRIBUTES,
        ]);
    }
}
