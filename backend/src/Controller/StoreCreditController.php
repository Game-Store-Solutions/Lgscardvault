<?php

namespace App\Controller;

use App\Entity\Store;
use App\Entity\StoreCreditTransaction;
use App\Entity\User;
use App\Repository\StoreCreditTransactionRepository;
use App\Repository\StoreRepository;
use App\Repository\UserRepository;
use App\Service\Credit\StoreCreditLedger;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Store credit: customers read their own balance and history; staff can
 * adjust a customer's balance (counter corrections, goodwill credit).
 * All movement rules live in StoreCreditLedger.
 */
#[Route('/api/stores/{slug}')]
final class StoreCreditController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $storeRepository,
        private readonly UserRepository $userRepository,
        private readonly StoreCreditTransactionRepository $transactions,
        private readonly StoreCreditLedger $ledger,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    /** Customer: own balance + ledger at this store. */
    #[Route('/customer/credit', name: 'api_store_customer_credit', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function myCredit(string $slug): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        $user = $this->getUser();
        if (null === $store || !$user instanceof User) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $this->json([
            'balanceCents' => $this->ledger->balance($user, $store),
            'transactions' => array_map($this->serializeTransaction(...), $this->transactions->historyFor($user, $store)),
        ]);
    }

    /** Staff: grant or deduct credit for a customer (positive or negative cents). */
    #[Route('/customers/{userId}/credit', name: 'api_store_customer_credit_adjust', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function adjust(Request $request, string $slug, int $userId): JsonResponse
    {
        $store = $this->storeRepository->findOneBySlug($slug);
        if (null === $store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }
        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        $customer = $this->userRepository->find($userId);
        if (!$customer instanceof User) {
            return $this->json(['detail' => 'Customer not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        $amount = is_array($payload) ? (int) ($payload['amountCents'] ?? 0) : 0;
        if (0 === $amount) {
            return $this->json(['detail' => 'amountCents must be a non-zero amount (negative deducts).'], 422);
        }
        $note = trim((string) ($payload['note'] ?? ''));

        $balance = $this->ledger->balance($customer, $store);
        if ($amount < 0 && $balance + $amount < 0) {
            return $this->json(['detail' => sprintf('Deduction exceeds the customer\'s balance (%d cents).', $balance)], 422);
        }

        $transaction = (new StoreCreditTransaction())
            ->setStore($store)
            ->setUser($customer)
            ->setAmountCents($amount)
            ->setKind(StoreCreditTransaction::KIND_ADJUSTMENT)
            ->setNote('' === $note ? null : mb_substr($note, 0, 255));
        $this->entityManager->persist($transaction);
        $this->entityManager->flush();

        return $this->json([
            'balanceCents' => $this->ledger->balance($customer, $store),
            'transaction' => $this->serializeTransaction($transaction),
        ], 201);
    }

    /** @return array<string, mixed> */
    private function serializeTransaction(StoreCreditTransaction $transaction): array
    {
        return [
            'id' => $transaction->getId(),
            'amountCents' => $transaction->getAmountCents(),
            'kind' => $transaction->getKind(),
            'note' => $transaction->getNote(),
            'orderReference' => $transaction->getOrder()?->getReference(),
            'sellSubmissionId' => $transaction->getSellSubmission()?->getId(),
            'createdAt' => $transaction->getCreatedAt()->format(DATE_ATOM),
        ];
    }
}
