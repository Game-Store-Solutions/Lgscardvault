<?php

namespace App\Controller;

use App\Repository\OrderRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Platform-admin ledger of storefront Square shopper payments (not subscription billing).
 */
#[Route('/api/admin')]
#[IsGranted('ROLE_SUPER_ADMIN')]
final class AdminSquareTransactionsController extends AbstractController
{
    public function __construct(
        private readonly OrderRepository $orders,
    ) {
    }

    #[Route('/square/transactions', name: 'api_admin_square_transactions', methods: ['GET'])]
    public function index(Request $request): JsonResponse
    {
        $result = $this->orders->findSquareShopperPayments([
            'store' => $request->query->get('store'),
            'status' => $request->query->get('status'),
            'q' => $request->query->get('q'),
            'from' => $request->query->get('from'),
            'to' => $request->query->get('to'),
            'limit' => (int) $request->query->get('limit', 50),
            'offset' => (int) $request->query->get('offset', 0),
        ]);

        return $this->json([
            'summary' => $result['summary'],
            'limit' => $result['limit'],
            'offset' => $result['offset'],
            'transactions' => array_map(static function (array $row): array {
                return [
                    'orderId' => $row['orderId'],
                    'reference' => $row['reference'],
                    'storeSlug' => $row['storeSlug'],
                    'storeName' => $row['storeName'],
                    'status' => $row['status'],
                    'paidCents' => $row['paidCents'],
                    'paymentReference' => $row['paymentReference'],
                    'squareOrderId' => $row['squareOrderId'],
                    'customerEmail' => $row['customerEmail'],
                    'createdAt' => $row['createdAt'] instanceof \DateTimeInterface
                        ? $row['createdAt']->format(\DATE_ATOM)
                        : (string) $row['createdAt'],
                ];
            }, $result['transactions']),
        ]);
    }
}
