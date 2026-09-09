<?php

namespace App\Service\CaseCards;

use App\Entity\InventoryItem;
use App\Entity\OrderLine;
use App\Repository\StoreSectionCardRepository;

/**
 * Attributes sales to case-section pools and reverses them on cancel/refund.
 *
 * When a purchased listing sits in a display-case section with unsold copies,
 * the sale comes "from the case": the section's pool depletes (never below
 * zero — a pool cannot be oversold), the order line records which section it
 * came from plus name snapshots for print sheets, and caseQuantity says how
 * many of the line's copies staff must pull from that section. Copies beyond
 * the pool are regular back-stock and stay unlabeled.
 *
 * A line is attributed to at most ONE section (the first open pool in case /
 * section display order), keeping fulfillment paperwork unambiguous.
 *
 * When the listing's on-hand stock hits zero, every case pool for that listing
 * is exhausted (soldQuantity = quantity) so Case Cards no longer show it.
 * Rows stay in the database so open pull sheets and cancel/refund can restore
 * the pool when stock comes back.
 */
final class SectionSaleAllocator
{
    public function __construct(
        private readonly StoreSectionCardRepository $sectionCards,
    ) {
    }

    /** Claim up to $quantity copies from the first open pool holding this listing. */
    public function allocateLine(OrderLine $line, InventoryItem $item, int $quantity): void
    {
        if ($quantity < 1) {
            $this->exhaustPoolsIfOutOfStock($item);

            return;
        }

        foreach ($this->sectionCards->findOpenPoolsForItem($item) as $pool) {
            $take = min($quantity, $pool->remaining());
            if ($take < 1) {
                continue;
            }

            $pool->setSoldQuantity($pool->getSoldQuantity() + $take);

            $section = $pool->getSection();
            $line->setSectionCard($pool);
            $line->setCaseQuantity($take);
            $line->setSectionTitle($section?->getTitle());
            $line->setCaseName($section?->getStoreCase()?->getName());

            break;
        }

        // Callers decrement InventoryItem before allocate — last copy sold means
        // the listing must leave every case display.
        $this->exhaustPoolsIfOutOfStock($item);
    }

    /**
     * Return a cancelled/refunded line's copies to its section pool. The
     * snapshots stay — the order's paperwork still shows where it came from.
     */
    public function releaseLine(OrderLine $line): void
    {
        $pool = $line->getSectionCard();
        if (null === $pool || $line->getCaseQuantity() < 1) {
            return;
        }

        $pool->setSoldQuantity(max(0, $pool->getSoldQuantity() - $line->getCaseQuantity()));
    }

    /**
     * Zero remaining on every case slot for a listing that no longer has stock.
     * Keeps the row for pull-sheet / cancel restore; storefront + admin hide
     * remaining === 0.
     */
    public function exhaustPoolsIfOutOfStock(InventoryItem $item): void
    {
        if ($item->getQuantity() > 0) {
            return;
        }

        foreach ($this->sectionCards->findAllForItem($item) as $pool) {
            if ($pool->remaining() > 0) {
                $pool->setSoldQuantity($pool->getQuantity());
            }
        }
    }
}
