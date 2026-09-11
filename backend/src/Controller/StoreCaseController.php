<?php

namespace App\Controller;

use App\Entity\Store;
use App\Entity\StoreCase;
use App\Repository\StoreCaseRepository;
use App\Repository\StoreRepository;
use App\Repository\StoreSectionRepository;
use App\Service\CaseCards\ColorIdentityParser;
use App\Service\CaseCards\SectionSerializer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Display cases — the top level of the Case Cards feature. A store has any
 * number of named physical cases ("Front Counter", "Wall Case"), each divided
 * into sections. The GET collection is public (it backs the storefront Case
 * Cards page, nested cases → sections → cards); mutations require STORE_MANAGE.
 *
 * Section-level operations live in StoreSectionController.
 */
#[Route('/api/stores/{slug}/cases')]
final class StoreCaseController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly StoreCaseRepository $caseRepository,
        private readonly StoreSectionRepository $sectionRepository,
        private readonly SectionSerializer $serializer,
        private readonly ColorIdentityParser $colorIdentityParser,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /** Public: the store's cases with sections and cards, for the storefront page. */
    #[Route('', name: 'api_store_cases_list', methods: ['GET'])]
    public function list(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json(array_map(
            $this->serializeCase(...),
            $this->caseRepository->findForStore($store),
        ));
    }

    /** The color-filter vocabulary, for admin autocomplete. Public and static. */
    #[Route('/filter-suggestions', name: 'api_store_cases_filter_suggestions', methods: ['GET'])]
    public function filterSuggestions(): JsonResponse
    {
        return $this->json(['colorIdentities' => $this->colorIdentityParser->suggestions()]);
    }

    #[Route('', name: 'api_store_cases_create', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function create(Request $request, string $slug): JsonResponse
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        $name = trim((string) (is_array($payload) ? ($payload['name'] ?? '') : ''));
        if ('' === $name) {
            return $this->json(['detail' => 'A case name is required.'], 422);
        }

        $case = new StoreCase();
        $case->setStore($store);
        $case->setName(mb_substr($name, 0, 120));
        $case->setPosition($this->caseRepository->nextPosition($store));

        $this->entityManager->persist($case);
        $this->entityManager->flush();

        return $this->json($this->serializeCase($case), 201);
    }

    /**
     * Reorder sections inside a case. Body: `{ "sectionIds": [3, 1, 2] }` —
     * a complete permutation of that case's section ids. Positions are
     * rewritten 0..n-1 so storefront order and sale-pool priority match.
     */
    #[Route('/{id}/sections/reorder', name: 'api_store_cases_sections_reorder', methods: ['PUT'])]
    #[IsGranted('ROLE_USER')]
    public function reorderSections(Request $request, string $slug, int $id): JsonResponse
    {
        $case = $this->findManagedCase($slug, $id);
        if (!$case instanceof StoreCase) {
            return $this->json(['detail' => 'Case not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        $sectionIds = is_array($payload) ? ($payload['sectionIds'] ?? null) : null;
        if (!is_array($sectionIds) || [] === $sectionIds) {
            return $this->json(['detail' => 'sectionIds must be a non-empty array of section ids.'], 422);
        }

        $normalized = [];
        foreach ($sectionIds as $sectionId) {
            if (!is_int($sectionId) && !(is_string($sectionId) && ctype_digit($sectionId))) {
                return $this->json(['detail' => 'Each sectionId must be an integer.'], 422);
            }
            $normalized[] = (int) $sectionId;
        }

        if (count($normalized) !== count(array_unique($normalized))) {
            return $this->json(['detail' => 'sectionIds must not contain duplicates.'], 422);
        }

        $existing = $this->sectionRepository->findForCase($case);
        $byId = [];
        foreach ($existing as $section) {
            $byId[(int) $section->getId()] = $section;
        }

        if (count($normalized) !== count($byId)) {
            return $this->json(['detail' => 'sectionIds must include every section in this case exactly once.'], 422);
        }

        foreach ($normalized as $sectionId) {
            if (!isset($byId[$sectionId])) {
                return $this->json(['detail' => sprintf('Section %d is not in this case.', $sectionId)], 422);
            }
        }

        foreach ($normalized as $position => $sectionId) {
            $byId[$sectionId]->setPosition($position);
        }

        $this->entityManager->flush();

        return $this->json($this->serializeCase($case));
    }

    #[Route('/{id}', name: 'api_store_cases_update', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function update(Request $request, string $slug, int $id): JsonResponse
    {
        $case = $this->findManagedCase($slug, $id);
        if (!$case instanceof StoreCase) {
            return $this->json(['detail' => 'Case not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        if (is_array($payload) && array_key_exists('name', $payload)) {
            $name = trim((string) $payload['name']);
            if ('' === $name) {
                return $this->json(['detail' => 'A case name cannot be empty.'], 422);
            }
            $case->setName(mb_substr($name, 0, 120));
        }

        $this->entityManager->flush();

        return $this->json($this->serializeCase($case));
    }

    #[Route('/{id}', name: 'api_store_cases_delete', methods: ['DELETE'])]
    #[IsGranted('ROLE_USER')]
    public function delete(string $slug, int $id): JsonResponse
    {
        $case = $this->findManagedCase($slug, $id);
        if (!$case instanceof StoreCase) {
            return $this->json(['detail' => 'Case not found.'], 404);
        }

        $this->entityManager->remove($case);
        $this->entityManager->flush();

        return $this->json(null, 204);
    }

    private function findManagedStore(string $slug): ?Store
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return null;
        }

        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $store;
    }

    private function findManagedCase(string $slug, int $id): ?StoreCase
    {
        $store = $this->findManagedStore($slug);
        if (!$store instanceof Store) {
            return null;
        }

        return $this->caseRepository->findOneForStore($store, $id);
    }

    private function serializeCase(StoreCase $case): array
    {
        return $this->serializer->serializeCase($case);
    }
}
