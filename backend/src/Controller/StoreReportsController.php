<?php

namespace App\Controller;

use App\Repository\CustomerWantListEntryRepository;
use App\Repository\StoreRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/stores/{slug}/reports')]
#[IsGranted('ROLE_USER')]
final class StoreReportsController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly CustomerWantListEntryRepository $wantList,
    ) {
    }

    /** Want-list demand for store analytics (most wanted cards). */
    #[Route('/want-list', name: 'api_store_reports_want_list', methods: ['GET'])]
    public function wantList(string $slug, Request $request): JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        $limit = (int) $request->query->get('limit', 25);
        $items = $this->wantList->aggregateMostWantedForStore($store, $limit);

        return $this->json([
            'storeSlug' => $store->getSlug(),
            'items' => $items,
        ]);
    }
}
