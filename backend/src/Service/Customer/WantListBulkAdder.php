<?php

namespace App\Service\Customer;

use App\Entity\Card;
use App\Entity\CustomerWantListEntry;
use App\Entity\Game;
use App\Entity\StoreCustomer;
use App\Repository\CardRepository;
use App\Repository\CustomerWantListEntryRepository;
use App\Service\Catalog\CatalogSearchRanker;
use App\Service\Catalog\FinishVocabulary;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Resolves pasted decklist names against the local catalog and writes
 * want-list rows. Controllers own the flush.
 */
final readonly class WantListBulkAdder
{
    public const NOTE = 'Added from bulk want list';

    public function __construct(
        private EntityManagerInterface $entityManager,
        private CardRepository $cards,
        private CustomerWantListEntryRepository $wantList,
        private CatalogSearchRanker $ranker,
    ) {
    }

    /**
     * @param list<array<string, mixed>> $lines
     *
     * @return array{added: int, skipped: int, unresolved: list<array{name: string, quantity: int}>, limit: int, remaining: int}
     */
    public function add(StoreCustomer $customer, Game $game, array $lines): array
    {
        [$normalized, $skipped] = $this->normalize($lines);
        $used = null === $customer->getId() ? 0 : $this->wantList->countForCustomer($customer);
        $slots = max(0, WantListLimits::MAX_ENTRIES - $used);
        $existing = $this->existingByCardId($customer);
        $candidates = $this->cards->findCandidatesByNames($game, array_column($normalized, 'name'));

        $added = 0;
        $unresolved = [];

        foreach ($normalized as $line) {
            $card = $this->pick($candidates, $line['name']);
            if (!$card instanceof Card) {
                $unresolved[] = $line;
                continue;
            }

            $key = (string) $card->getId();
            $entry = $existing[$key] ?? null;
            if ($entry instanceof CustomerWantListEntry) {
                $entry->setQuantity($entry->getQuantity() + $line['quantity']);
                ++$added;
                continue;
            }
            if ($slots <= 0) {
                ++$skipped;
                continue;
            }

            $entry = (new CustomerWantListEntry())
                ->setCustomer($customer)
                ->setCard($card)
                ->setCardName(mb_substr($card->getName(), 0, 255))
                ->setSetCode($card->getSetCode())
                ->setFinish(FinishVocabulary::DEFAULT_PLAIN)
                ->setQuantity($line['quantity'])
                ->setNotes(self::NOTE);

            $this->entityManager->persist($entry);
            $existing[$key] = $entry;
            --$slots;
            ++$added;
        }

        return [
            'added' => $added,
            'skipped' => $skipped,
            'unresolved' => $unresolved,
            'limit' => WantListLimits::MAX_ENTRIES,
            'remaining' => $slots,
        ];
    }

    /**
     * @param list<array<string, mixed>> $lines
     *
     * @return array{0: list<array{name: string, quantity: int}>, 1: int}
     */
    private function normalize(array $lines): array
    {
        $merged = [];
        $seen = 0;
        $skipped = 0;
        foreach ($lines as $line) {
            if (!\is_array($line)) {
                continue;
            }
            $name = trim((string) ($line['name'] ?? ''));
            $quantity = max(1, (int) ($line['quantity'] ?? 1));
            if ('' === $name) {
                continue;
            }
            if ($seen >= WantListLimits::MAX_PARSE) {
                ++$skipped;
                continue;
            }
            ++$seen;
            $key = mb_strtolower($name);
            if (isset($merged[$key])) {
                $merged[$key]['quantity'] += $quantity;
                continue;
            }
            $merged[$key] = ['name' => $name, 'quantity' => $quantity];
        }

        return [array_values($merged), $skipped];
    }

    /** @return array<string, CustomerWantListEntry> */
    private function existingByCardId(StoreCustomer $customer): array
    {
        if (null === $customer->getId()) {
            return [];
        }

        $byCard = [];
        foreach ($this->wantList->findForCustomer($customer) as $entry) {
            $card = $entry->getCard();
            if ($card instanceof Card) {
                $byCard[(string) $card->getId()] = $entry;
            }
        }

        return $byCard;
    }

    /**
     * @param list<Card> $candidates
     */
    private function pick(array $candidates, string $name): ?Card
    {
        $folded = mb_strtolower($name);
        $hits = [];
        foreach ($candidates as $card) {
            $full = mb_strtolower($card->getName());
            $front = str_contains($full, ' // ') ? trim(explode(' // ', $full, 2)[0]) : $full;
            if ($full === $folded || $front === $folded || str_starts_with($full, $folded) || str_contains($full, $folded)) {
                $hits[] = $card;
            }
        }
        if ([] === $hits) {
            return null;
        }

        $ranked = $this->ranker->uniqueCards($this->ranker->rank($hits, $name));

        return $ranked[0] ?? null;
    }
}
