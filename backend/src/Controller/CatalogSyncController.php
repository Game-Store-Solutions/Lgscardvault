<?php

namespace App\Controller;

use App\Message\SyncGameCatalogMessage;
use App\Repository\CatalogSyncRunRepository;
use App\Repository\GameRepository;
use App\Service\Catalog\GameCatalogSerializer;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Platform admin: trigger TCGCSV catalog syncs and inspect run history.
 * Syncs are queued on the messenger worker (a full game sync makes
 * hundreds of catalog requests) — the run record appears once the worker
 * picks it up.
 */
#[Route('/api/admin/catalog')]
final class CatalogSyncController extends AbstractController
{
    public function __construct(
        private readonly GameRepository $games,
        private readonly CatalogSyncRunRepository $syncRuns,
        private readonly GameCatalogSerializer $serializer,
        private readonly MessageBusInterface $messageBus,
        private readonly \App\Service\Tcgcsv\CatalogSyncRunner $syncRunner,
    ) {
    }

    #[Route('/games', name: 'api_admin_catalog_games', methods: ['GET'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function games(): JsonResponse
    {
        return $this->json(array_map(
            $this->serializer->game(...),
            $this->games->findBy([], ['position' => 'ASC', 'id' => 'ASC']),
        ));
    }

    #[Route('/sync/{code}', name: 'api_admin_catalog_sync', methods: ['POST'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function sync(string $code): JsonResponse
    {
        $game = $this->games->findOneByCode($code);
        if (null === $game) {
            return $this->json(['detail' => 'Unknown game.'], 404);
        }
        if (null === $game->getTcgcsvCategoryId()) {
            return $this->json(['detail' => sprintf('Game "%s" has no TCGCSV category configured.', $game->getCode())], 400);
        }

        $this->messageBus->dispatch(new SyncGameCatalogMessage($game->getCode()));

        return $this->json(['status' => 'queued', 'game' => $game->getCode()], 202);
    }

    #[Route('/sync-runs', name: 'api_admin_catalog_sync_runs', methods: ['GET'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function syncRuns(): JsonResponse
    {
        // A run whose worker was killed can never close itself out; reaping
        // on read keeps the view honest instead of showing it running forever.
        $this->syncRunner->failStaleRuns();

        return $this->json(array_map($this->serializer->syncRun(...), $this->syncRuns->findRecent()));
    }
}
