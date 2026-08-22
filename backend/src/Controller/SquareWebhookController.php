<?php

namespace App\Controller;

use App\Entity\Order;
use App\Entity\SquareWebhookEvent;
use App\Entity\StorePaymentAccount;
use App\Enum\OrderStatus;
use App\Repository\OrderRepository;
use App\Repository\SquareWebhookEventRepository;
use App\Repository\StorePaymentAccountRepository;
use App\Service\Checkout\OrderStockReleaser;
use App\Service\Payments\SquareWebhookVerifier;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Receives Square's asynchronous notifications.
 *
 * Events tell us about things that happen outside our own request flow: a
 * merchant disconnecting from Square's side, a refund issued from the seller's
 * Square dashboard, or a shopper disputing a charge. Without this the platform
 * only ever learns about money it moved itself.
 *
 * The endpoint is public by necessity, so the HMAC signature is the only
 * authentication, and every accepted event is recorded so redelivery cannot
 * apply the same side effect twice.
 */
final class SquareWebhookController extends AbstractController
{
    public function __construct(
        private readonly SquareWebhookVerifier $verifier,
        private readonly SquareWebhookEventRepository $events,
        private readonly StorePaymentAccountRepository $accounts,
        private readonly OrderRepository $orders,
        private readonly OrderStockReleaser $stockReleaser,
        private readonly EntityManagerInterface $entityManager,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/api/integrations/square/webhook', name: 'api_square_webhook', methods: ['POST'])]
    public function handle(Request $request): JsonResponse
    {
        $rawBody = $request->getContent();

        if (!$this->verifier->verify($rawBody, $request->headers->get(SquareWebhookVerifier::SIGNATURE_HEADER))) {
            // Deliberately vague: a probe should not learn whether the endpoint
            // is unconfigured or its signature merely wrong.
            return $this->json(['detail' => 'Invalid signature.'], Response::HTTP_UNAUTHORIZED);
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Malformed payload.'], Response::HTTP_BAD_REQUEST);
        }

        $eventId = (string) ($payload['event_id'] ?? '');
        $type = (string) ($payload['type'] ?? '');
        $merchantId = $this->nullableString($payload['merchant_id'] ?? null);

        if ('' === $eventId || '' === $type) {
            return $this->json(['detail' => 'Missing event id or type.'], Response::HTTP_BAD_REQUEST);
        }

        if ($this->events->alreadySeen($eventId)) {
            return $this->json(['status' => 'duplicate']);
        }

        $event = new SquareWebhookEvent($eventId, mb_substr($type, 0, 64), $merchantId);

        try {
            [$status, $note] = $this->dispatch($type, is_array($payload['data'] ?? null) ? $payload['data'] : [], $merchantId);
            $event->markOutcome($status, $note);
        } catch (\Throwable $e) {
            // Record the failure but still acknowledge: Square would otherwise
            // redeliver for days, and the stored row is enough to replay by hand.
            $event->markOutcome(SquareWebhookEvent::STATUS_FAILED, $e->getMessage());
            $this->logger->error('Square webhook handling failed', ['event' => $eventId, 'type' => $type, 'error' => $e->getMessage()]);
        }

        $this->entityManager->persist($event);

        try {
            $this->entityManager->flush();
        } catch (UniqueConstraintViolationException) {
            // Concurrent redelivery beat us to it; the other request applied it.
            return $this->json(['status' => 'duplicate']);
        }

        return $this->json(['status' => $event->getStatus()]);
    }

    /**
     * @param array<string, mixed> $data
     *
     * @return array{0: string, 1: string|null} status and note for the audit row
     */
    private function dispatch(string $type, array $data, ?string $merchantId): array
    {
        return match ($type) {
            'oauth.authorization.revoked' => $this->handleRevocation($merchantId),
            'refund.created', 'refund.updated' => $this->handleRefund($data),
            'dispute.created' => $this->handleDispute($data),
            'payment.updated', 'payment.created' => $this->handlePayment($data),
            default => [SquareWebhookEvent::STATUS_IGNORED, 'No handler for this type.'],
        };
    }

    /**
     * Correlate Square payment events to our storefront orders for the admin ledger.
     *
     * @param array<string, mixed> $data
     *
     * @return array{0: string, 1: string|null}
     */
    private function handlePayment(array $data): array
    {
        $payment = is_array($data['object']['payment'] ?? null) ? $data['object']['payment'] : [];
        $paymentId = $this->nullableString($payment['id'] ?? null);
        if (null === $paymentId) {
            return [SquareWebhookEvent::STATUS_IGNORED, 'Payment event without id.'];
        }

        $order = $this->findOrderForPayment($payment, $paymentId);
        if (!$order instanceof Order) {
            return [SquareWebhookEvent::STATUS_IGNORED, 'No LGS order for payment '.$paymentId];
        }

        $status = (string) ($payment['status'] ?? 'UNKNOWN');
        $squareOrderId = $this->nullableString($payment['order_id'] ?? null);
        if (null !== $squareOrderId && null === $order->getSquareOrderId()) {
            $order->setSquareOrderId($squareOrderId);
        }

        if ('COMPLETED' === $status && $order->getPaidCents() < 1) {
            $amount = (int) ($payment['amount_money']['amount'] ?? 0);
            if ($amount > 0) {
                $order->setPaidCents($amount)->setPaymentReference($paymentId);
                if (Order::NOTE_PAY_IN_STORE === $order->getNotes()) {
                    $order->setNotes(null);
                }
            }
        }

        return [SquareWebhookEvent::STATUS_PROCESSED, sprintf(
            'Payment %s (%s) for order %s',
            $paymentId,
            $status,
            $order->getReference(),
        )];
    }

    /**
     * @param array<string, mixed> $payment
     */
    private function findOrderForPayment(array $payment, string $paymentId): ?Order
    {
        $order = $this->orders->findOneBy(['paymentReference' => $paymentId]);
        if ($order instanceof Order) {
            return $order;
        }

        $squareOrderId = $this->nullableString($payment['order_id'] ?? null);
        if (null !== $squareOrderId) {
            $order = $this->orders->findOneBy(['squareOrderId' => $squareOrderId]);
            if ($order instanceof Order) {
                return $order;
            }
        }

        $reference = $this->nullableString($payment['reference_id'] ?? null);
        if (null !== $reference) {
            $order = $this->orders->findOneBy(['reference' => $reference]);
            if ($order instanceof Order) {
                return $order;
            }
        }

        $note = $this->nullableString($payment['note'] ?? null);
        if (null !== $note && 1 === preg_match('/\b(ORD-[A-Z0-9]+)\b/', $note, $matches)) {
            $order = $this->orders->findOneBy(['reference' => $matches[1]]);
            if ($order instanceof Order) {
                return $order;
            }
        }

        return null;
    }

    /**
     * The merchant revoked our access from Square. Their checkout is dead until
     * they reconnect, so mark it rather than letting shoppers hit failures.
     *
     * @return array{0: string, 1: string|null}
     */
    private function handleRevocation(?string $merchantId): array
    {
        if (null === $merchantId) {
            return [SquareWebhookEvent::STATUS_IGNORED, 'Revocation without a merchant id.'];
        }

        $account = $this->accounts->findOneByMerchantId($merchantId);
        if (!$account instanceof StorePaymentAccount) {
            return [SquareWebhookEvent::STATUS_IGNORED, 'No connected account for merchant '.$merchantId];
        }

        // setLastError() flips the status to "error", so record the reason
        // first and let markDisconnected() have the final say: this is a clean
        // revocation to recover from, not a malfunction.
        $account->setLastError('Access was revoked from the Square dashboard. Reconnect to keep taking payments.')
            ->markDisconnected();

        return [SquareWebhookEvent::STATUS_PROCESSED, 'Disconnected store '.($account->getStore()?->getSlug() ?? '?')];
    }

    /**
     * A refund raised outside our admin — typically in the seller's own Square
     * dashboard. Mirror it so stock and store credit come back.
     *
     * @param array<string, mixed> $data
     *
     * @return array{0: string, 1: string|null}
     */
    private function handleRefund(array $data): array
    {
        $refund = is_array($data['object']['refund'] ?? null) ? $data['object']['refund'] : [];

        if ('COMPLETED' !== (string) ($refund['status'] ?? '')) {
            return [SquareWebhookEvent::STATUS_IGNORED, 'Refund not completed yet.'];
        }

        $paymentId = $this->nullableString($refund['payment_id'] ?? null);
        if (null === $paymentId) {
            return [SquareWebhookEvent::STATUS_IGNORED, 'Refund without a payment id.'];
        }

        $order = $this->orders->findOneBy(['paymentReference' => $paymentId]);
        if (!$order instanceof Order) {
            return [SquareWebhookEvent::STATUS_IGNORED, 'No order for payment '.$paymentId];
        }

        // CANCELLED and REFUNDED are terminal, so an order already unwound by
        // our own admin cannot be restocked a second time here.
        if (!$order->getStatus()->canTransitionTo(OrderStatus::REFUNDED)) {
            return [SquareWebhookEvent::STATUS_IGNORED, 'Order '.$order->getReference().' is already '.$order->getStatus()->value];
        }

        $order->setStatus(OrderStatus::REFUNDED);
        $this->stockReleaser->release($order);

        return [SquareWebhookEvent::STATUS_PROCESSED, 'Refunded order '.$order->getReference()];
    }

    /**
     * Disputes are decided by the card network, not by us. Record the link to
     * the order so staff can find it; deliberately no automatic restocking,
     * since the goods may already be gone and the dispute may still be won.
     *
     * @param array<string, mixed> $data
     *
     * @return array{0: string, 1: string|null}
     */
    private function handleDispute(array $data): array
    {
        $dispute = is_array($data['object']['dispute'] ?? null) ? $data['object']['dispute'] : [];
        $paymentId = $this->nullableString($dispute['disputed_payment']['payment_id'] ?? null);

        $order = null === $paymentId ? null : $this->orders->findOneBy(['paymentReference' => $paymentId]);
        $reference = $order instanceof Order ? $order->getReference() : 'unknown order';

        $this->logger->warning('Square dispute opened', [
            'payment' => $paymentId,
            'order' => $reference,
            'amount' => $dispute['amount_money']['amount'] ?? null,
            'reason' => $dispute['reason'] ?? null,
        ]);

        if ($order instanceof Order) {
            $order->markDisputed((string) ($dispute['reason'] ?? 'chargeback'));
        }

        return [SquareWebhookEvent::STATUS_PROCESSED, 'Dispute recorded for '.$reference];
    }

    private function nullableString(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $trimmed = trim($value);

        return '' !== $trimmed ? $trimmed : null;
    }
}
