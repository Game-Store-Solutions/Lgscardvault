<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\MultiTenancy\TenantContext;
use App\Repository\CardRepository;
use App\Repository\InventoryItemRepository;
use App\Service\Inventory\StoreInventoryWriter;
use App\Service\Scryfall\ScryfallClient;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Uid\Uuid;
use ApiPlatform\Metadata\Patch;

/** @implements ProcessorInterface<InventoryItem, InventoryItem> */
final readonly class StoreInventoryProcessor implements ProcessorInterface
{
    public function __construct(
        private TenantContext $tenantContext,
        private CardRepository $cardRepository,
        private InventoryItemRepository $inventoryItemRepository,
        private StoreInventoryWriter $inventoryWriter,
        private EntityManagerInterface $entityManager,
        private ScryfallClient $scryfallClient,
        private LoggerInterface $logger,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): InventoryItem
    {
        if (!$data instanceof InventoryItem) {
            throw new \InvalidArgumentException('Expected InventoryItem.');
        }

        $store = $this->tenantContext->getStore();
        if (!$store instanceof Store) {
            throw new NotFoundHttpException('Store not found.');
        }

        // Resolve cardId whenever supplied — on PATCH this lets an owner switch the
        // listing to a different printing (previously ignored because the item
        // already had a card).
        if ($data->getCardId()) {
            try {
                $card = $this->cardRepository->find(Uuid::fromString($data->getCardId()));
            } catch (\InvalidArgumentException) {
                throw new BadRequestHttpException('Invalid card id.');
            }
            if (null === $card) {
                throw new NotFoundHttpException('Card not found.');
            }
            $data->setCard($card);
        }

        if ($operation instanceof Patch) {
            $existing = $this->inventoryItemRepository->find($uriVariables['id'] ?? null);
            if (!$existing instanceof InventoryItem || $existing->getStore()?->getId() !== $store->getId()) {
                throw new NotFoundHttpException('Inventory item not found.');
            }

            $targetCard = $data->getCard() ?? $existing->getCard();
            if (!$targetCard instanceof \App\Entity\Card) {
                throw new BadRequestHttpException('Card is required.');
            }

            // Enrich the printing from Scryfall if we've never fetched its data, so
            // market price becomes available for this card going forward.
            if (null === $targetCard->getScryfallData()) {
                try {
                    $this->scryfallClient->fetchCardById($targetCard->getId());
                } catch (\Throwable $e) {
                    $this->logger->warning('Scryfall enrichment failed for card {id}: {error}', [
                        'id' => (string) $targetCard->getId(),
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            $conflict = $this->inventoryItemRepository->findOneBy([
                'store' => $store,
                'card' => $targetCard,
                'condition' => $data->getCondition(),
                'isFoil' => $data->isFoil(),
            ]);

            if ($conflict instanceof InventoryItem && $conflict->getId() !== $existing->getId()) {
                // The edit moves $existing onto a (card, condition, foil) slot that is
                // already occupied. Rather than destroying the conflicting row (and its
                // quantity/notes), MERGE into it the way StoreInventoryWriter does on
                // create: sum the quantities and keep a single row. The edited row is
                // then removed since it has been folded into the conflict.
                $conflict->setQuantity($conflict->getQuantity() + $data->getQuantity());
                $conflict->setPriceCents($data->getPriceCents());
                if (null !== $data->getAcquisitionCostCents()) {
                    $conflict->setAcquisitionCostCents($data->getAcquisitionCostCents());
                }

                $notes = $data->getNotes();
                if (null !== $notes && '' !== trim($notes)) {
                    $conflict->setNotes($notes);
                }

                $this->entityManager->remove($existing);
                $this->entityManager->flush();

                return $conflict;
            }

            $existing->setCard($targetCard);
            $existing->setQuantity($data->getQuantity());
            $existing->setPriceCents($data->getPriceCents());
            $existing->setAcquisitionCostCents($data->getAcquisitionCostCents());
            $existing->setCondition($data->getCondition());
            $existing->setIsFoil($data->isFoil());
            $existing->setNotes($data->getNotes());
            $this->entityManager->flush();

            return $existing;
        }

        if (null === $data->getCard()) {
            throw new BadRequestHttpException('Card is required.');
        }

        $card = $data->getCard();
        return $this->inventoryWriter->write(
            $store,
            $card,
            $data->getQuantity(),
            $data->getCondition(),
            $data->isFoil(),
            $data->getNotes(),
            acquisitionCostCents: $data->getAcquisitionCostCents(),
        );
    }
}
