<?php

namespace App\Service\CaseCards;

use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Entity\StoreSection;
use App\Repository\InventoryItemRepository;
use App\Repository\StoreSectionCardRepository;

/**
 * Picks the inventory listings an auto section should hold, honoring every
 * filter the section defines plus cross-section stock accounting:
 *
 *  - price range, rarity, set, and card type filter in SQL;
 *  - color identity (a JSON column) filters in PHP over bounded batches;
 *  - stock already claimed by the store's OTHER sections is subtracted, so
 *    auto-fill only uses the remaining eligible inventory and two sections
 *    never promise the same physical copy.
 */
final class SectionAutoFiller
{
    /** Candidate rows fetched per round trip while hunting for matches. */
    private const BATCH_SIZE = 200;

    /** Upper bound on rows scanned per fill — keeps a sparse filter from walking a 200k-item inventory. */
    private const MAX_SCANNED_ROWS = 5000;

    public function __construct(
        private readonly InventoryItemRepository $inventoryItems,
        private readonly StoreSectionCardRepository $sectionCards,
        private readonly ColorIdentityParser $colorIdentityParser,
    ) {
    }

    /**
     * Listings the section should contain, highest price first, at most
     * $limit. Each returned listing has at least one copy free after the
     * store's other sections' unsold allocations are honored. $excludeItemIds
     * are skipped so cards already in this section are not duplicated by a
     * later auto-fill.
     *
     * @param list<int> $excludeItemIds
     *
     * @return list<InventoryItem>
     */
    public function pickListings(StoreSection $section, int $limit, array $excludeItemIds = []): array
    {
        $store = $section->getStore();
        if (!$store instanceof Store || $limit < 1) {
            return [];
        }

        $claimedElsewhere = $this->sectionCards->remainingAllocatedByItem($store, $section);
        $colorCode = $section->getAutoColorIdentity();
        $excluded = array_fill_keys($excludeItemIds, true);

        $picked = [];
        for ($offset = 0; $offset < self::MAX_SCANNED_ROWS && count($picked) < $limit; $offset += self::BATCH_SIZE) {
            $batch = $this->inventoryItems->findAutoSectionCandidates(
                $store,
                $section->getAutoMinPriceCents(),
                $section->getAutoMaxPriceCents(),
                $section->getAutoRarity(),
                $section->getAutoSetCode(),
                $section->getAutoCardType(),
                $offset,
                self::BATCH_SIZE,
            );
            if ([] === $batch) {
                break;
            }

            foreach ($batch as $item) {
                $itemId = (int) $item->getId();
                if (isset($excluded[$itemId])) {
                    continue;
                }
                $freeStock = $item->getQuantity() - ($claimedElsewhere[$itemId] ?? 0);
                if ($freeStock < 1) {
                    continue;
                }
                if (null !== $colorCode && !$this->colorIdentityParser->matches($colorCode, $item->getCard()?->getColorIdentity())) {
                    continue;
                }

                $picked[] = $item;
                if (count($picked) >= $limit) {
                    break;
                }
            }
        }

        return $picked;
    }
}
