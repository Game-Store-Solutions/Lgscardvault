<?php

namespace App\Controller;

use App\Entity\Store;
use App\Repository\StoreRepository;
use App\Service\Compliance\StoreComplianceGate;
use App\Service\Store\StoreAdminRemover;
use App\Service\Store\StoreApplicationMailer;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Platform-admin review of self-serve store applications. Approving flips the
 * store live (status=approved, isActive=true); rejecting records a reason and
 * keeps the storefront dark. Also exposes disable / enable / hard-delete for
 * any store on the admin Stores tab.
 */
#[Route('/api/admin')]
#[IsGranted('ROLE_SUPER_ADMIN')]
class StoreApprovalController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly EntityManagerInterface $entityManager,
        private readonly StoreApplicationMailer $mailer,
        private readonly StoreAdminRemover $remover,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/stores/{id}/approve', name: 'api_admin_store_approve', methods: ['POST'])]
    public function approve(int $id): JsonResponse
    {
        $store = $this->storeRepository->find($id);
        if (!$store instanceof Store) {
            return $this->json(['error' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        $errors = StoreComplianceGate::errors($store);
        if ($errors !== []) {
            return $this->json(['error' => $errors[0]], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $store->setStatus(Store::STATUS_APPROVED)
            ->setIsActive(true)
            ->setRejectionReason(null);

        $this->entityManager->flush();

        // Notify the owner — but never let a mail failure fail the approval.
        try {
            $this->mailer->sendApproved($store);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to send store approval email.', ['store' => $store->getId(), 'error' => $e->getMessage()]);
        }

        return $this->json($this->serialize($store));
    }

    #[Route('/stores/{id}/reject', name: 'api_admin_store_reject', methods: ['POST'])]
    public function reject(int $id, Request $request): JsonResponse
    {
        $store = $this->storeRepository->find($id);
        if (!$store instanceof Store) {
            return $this->json(['error' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $reason = trim((string) ($payload['reason'] ?? ''));

        $store->setStatus(Store::STATUS_REJECTED)
            ->setIsActive(false)
            ->setRejectionReason('' !== $reason ? $reason : null);

        $this->entityManager->flush();

        try {
            $this->mailer->sendRejected($store, '' !== $reason ? $reason : null);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to send store rejection email.', ['store' => $store->getId(), 'error' => $e->getMessage()]);
        }

        return $this->json($this->serialize($store));
    }

    /** Take an approved store offline without deleting data. */
    #[Route('/stores/{id}/disable', name: 'api_admin_store_disable', methods: ['POST'])]
    public function disable(int $id): JsonResponse
    {
        $store = $this->storeRepository->find($id);
        if (!$store instanceof Store) {
            return $this->json(['error' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        $store->setIsActive(false)->setFeatured(false);
        $this->entityManager->flush();

        return $this->json($this->serialize($store));
    }

    /** Bring a previously approved, disabled store back online. */
    #[Route('/stores/{id}/enable', name: 'api_admin_store_enable', methods: ['POST'])]
    public function enable(int $id): JsonResponse
    {
        $store = $this->storeRepository->find($id);
        if (!$store instanceof Store) {
            return $this->json(['error' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        if (Store::STATUS_APPROVED !== $store->getStatus()) {
            return $this->json([
                'error' => 'Pending or rejected stores must be approved after license review.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $store->setIsActive(true);
        $this->entityManager->flush();

        return $this->json($this->serialize($store));
    }

    /**
     * Permanently delete a store and its dependent data. Requires
     * `{ "confirmSlug": "<slug>" }` so a mis-click cannot wipe a tenant.
     */
    #[Route('/stores/{id}/delete', name: 'api_admin_store_delete', methods: ['POST'])]
    public function delete(int $id, Request $request): JsonResponse
    {
        $store = $this->storeRepository->find($id);
        if (!$store instanceof Store) {
            return $this->json(['error' => 'Store not found.'], Response::HTTP_NOT_FOUND);
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $confirmSlug = trim((string) ($payload['confirmSlug'] ?? ''));
        if ($confirmSlug !== $store->getSlug()) {
            return $this->json([
                'error' => 'Type the store slug to confirm permanent deletion.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $snapshot = $this->serialize($store);
        $this->remover->remove($store);

        return $this->json(['status' => 'deleted', 'store' => $snapshot]);
    }

    /** @return array<string, mixed> */
    private function serialize(Store $store): array
    {
        return [
            'id' => $store->getId(),
            'name' => $store->getName(),
            'slug' => $store->getSlug(),
            'status' => $store->getStatus(),
            'isActive' => $store->isActive(),
            'rejectionReason' => $store->getRejectionReason(),
        ];
    }
}
