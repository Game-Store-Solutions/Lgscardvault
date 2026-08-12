<?php

namespace App\Controller;

use App\Entity\ScryfallSyncRun;
use App\Message\SyncScryfallCatalogMessage;
use App\Repository\ScryfallSyncRunRepository;
use App\Service\Scryfall\ScryfallClient;
use App\Service\Scryfall\ScryfallSyncRunner;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/scryfall')]
class ScryfallSyncController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $messageBus,
        private readonly EntityManagerInterface $entityManager,
        private readonly ScryfallSyncRunRepository $runs,
        private readonly ScryfallSyncRunner $runner,
    ) {
    }

    /**
     * Queues a bulk sync on the messenger worker and returns 202. Creates a
     * Sync Jobs row immediately so the admin UI can track it.
     */
    #[Route('/sync', name: 'api_admin_scryfall_sync', methods: ['POST'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function sync(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);
        $type = is_array($payload) && is_string($payload['type'] ?? null)
            ? $payload['type']
            : ScryfallClient::BULK_TYPE_ORACLE;

        if (!in_array($type, ScryfallClient::BULK_TYPES, true)) {
            return $this->json([
                'error' => sprintf('Unknown bulk type "%s". Valid types: %s.', $type, implode(', ', ScryfallClient::BULK_TYPES)),
            ], 400);
        }

        $this->runner->failStaleRuns();

        $run = new ScryfallSyncRun($type);
        $run->beat();
        $this->entityManager->persist($run);
        $this->entityManager->flush();

        $this->messageBus->dispatch(new SyncScryfallCatalogMessage($type, (int) $run->getId()));

        return $this->json([
            'status' => 'queued',
            'type' => $type,
            'run' => $this->runner->serialize($run),
        ], 202);
    }

    #[Route('/sync-runs', name: 'api_admin_scryfall_sync_runs', methods: ['GET'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function syncRuns(): JsonResponse
    {
        $this->runner->failStaleRuns();

        return $this->json(array_map(
            $this->runner->serialize(...),
            $this->runs->findRecent(),
        ));
    }
}
