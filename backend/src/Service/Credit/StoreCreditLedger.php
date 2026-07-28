<?php

namespace App\Service\Credit;

use App\Entity\Order;
use App\Entity\SellSubmission;
use App\Entity\Store;
use App\Entity\StoreCreditTransaction;
use App\Entity\User;
use App\Repository\StoreCreditTransactionRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * The store-credit ledger: balances are sums over an append-only
 * transaction log, so every cent of credit is traceable to the sell/trade
 * payout, order, or staff adjustment that moved it. Writers join the
 * caller's unit of work (no flush here) so credit moves atomically with
 * the business action that caused it.
 */
final readonly class StoreCreditLedger
{
    public function __construct(
        private StoreCreditTransactionRepository $transactions,
        private EntityManagerInterface $entityManager,
    ) {
    }

    public function balance(User $user, Store $store): int
    {
        return $this->transactions->balanceFor($user, $store);
    }

    /** Add credit (sell/trade payout, staff adjustment). Amount must be positive. */
    public function grant(
        Store $store,
        User $user,
        int $amountCents,
        string $kind,
        ?SellSubmission $sellSubmission = null,
        ?Order $order = null,
        ?string $note = null,
    ): StoreCreditTransaction {
        if ($amountCents < 1) {
            throw new \InvalidArgumentException('Credit grants must be a positive amount.');
        }

        return $this->record($store, $user, $amountCents, $kind, $sellSubmission, $order, $note);
    }

    /**
     * Spend credit against an order. Never overdrafts: throws
     * InsufficientStoreCreditException when the balance can't cover it.
     */
    public function spend(Store $store, User $user, int $amountCents, Order $order): StoreCreditTransaction
    {
        if ($amountCents < 1) {
            throw new \InvalidArgumentException('Credit spends must be a positive amount.');
        }
        $balance = $this->balance($user, $store);
        if ($balance < $amountCents) {
            throw new InsufficientStoreCreditException($balance, $amountCents);
        }

        return $this->record($store, $user, -$amountCents, StoreCreditTransaction::KIND_ORDER, null, $order, null);
    }

    private function record(
        Store $store,
        User $user,
        int $amountCents,
        string $kind,
        ?SellSubmission $sellSubmission,
        ?Order $order,
        ?string $note,
    ): StoreCreditTransaction {
        $transaction = (new StoreCreditTransaction())
            ->setStore($store)
            ->setUser($user)
            ->setAmountCents($amountCents)
            ->setKind($kind)
            ->setSellSubmission($sellSubmission)
            ->setOrder($order)
            ->setNote($note);
        $this->entityManager->persist($transaction);

        return $transaction;
    }
}
