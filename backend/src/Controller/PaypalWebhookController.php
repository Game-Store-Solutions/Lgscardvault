<?php

namespace App\Controller;

use App\Entity\Order;
use App\Entity\PaypalWebhookEvent;
use App\Entity\StorePaymentAccount;
use App\Enum\OrderStatus;
use App\Repository\OrderRepository;
use App\Repository\PaypalWebhookEventRepository;
use App\Repository\StorePaymentAccountRepository;
use App\Service\Checkout\OrderStockReleaser;
use App\Service\Payments\PaypalWebhookVerifier;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class PaypalWebhookController extends AbstractController
{
    public function __construct(
        private readonly PaypalWebhookVerifier $verifier,
        private readonly PaypalWebhookEventRepository $events,
        private readonly StorePaymentAccountRepository $accounts,
        private readonly OrderRepository $orders,
        private readonly OrderStockReleaser $stockReleaser,
        private readonly EntityManagerInterface $entityManager,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/api/integrations/paypal/webhook', name: 'api_paypal_webhook', methods: ['POST'])]
    public function handle(Request $request): JsonResponse
    {
        $rawBody = $request->getContent();

        if (!$this->verifier->verify($request, $rawBody)) {
            return $this->json(['detail' => 'Invalid signature.'], Response::HTTP_UNAUTHORIZED);
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Malformed payload.'], Response::HTTP_BAD_REQUEST);
        }

        $eventId = (string) ($payload['id'] ?? '');
        $type = (string) ($payload['event_type'] ?? '');
        $resource = is_array($payload['resource'] ?? null) ? $payload['resource'] : [];
        $merchantId = $this->nullableString($resource['payee']['merchant_id'] ?? $resource['merchant_id'] ?? null);

        if ('' === $eventId || '' === $type) {
            return $this->json(['detail' => 'Missing event id or type.'], Response::HTTP_BAD_REQUEST);
        }

        if ($this->events->alreadySeen($eventId)) {
            return $this->json(['status' => 'duplicate']);
        }

        $event = new PaypalWebhookEvent($eventId, mb_substr($type, 0, 64), $merchantId);

        try {
            [$status, $note] = $this->dispatch($type, $resource, $merchantId);
            $event->markOutcome($status, $note);
        } catch (\Throwable $e) {
            $event->markOutcome(PaypalWebhookEvent::STATUS_FAILED, $e->getMessage());
            $this->logger->error('PayPal webhook handling failed', ['event' => $eventId, 'type' => $type, 'error' => $e->getMessage()]);
        }

        $this->entityManager->persist($event);

        try {
            $this->entityManager->flush();
        } catch (UniqueConstraintViolationException) {
            return $this->json(['status' => 'duplicate']);
        }

        return $this->json(['status' => $event->getStatus()]);
    }

    /**
     * @param array<string, mixed> $resource
     *
     * @return array{0: string, 1: string|null}
     */
    private function dispatch(string $type, array $resource, ?string $merchantId): array
    {
        return match ($type) {
            'MERCHANT.ONBOARDING.COMPLETED', 'MERCHANT.PARTNER-CONSENT.REVOKED' => $this->handleRevocation($type, $merchantId),
            'PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED' => $this->handleRefund($resource),
            'CUSTOMER.DISPUTE.CREATED' => $this->handleDispute($resource),
            default => [PaypalWebhookEvent::STATUS_IGNORED, 'No handler for this type.'],
        };
    }

    /**
     * @return array{0: string, 1: string|null}
     */
    private function handleRevocation(string $type, ?string $merchantId): array
    {
        if ('MERCHANT.ONBOARDING.COMPLETED' === $type) {
            return [PaypalWebhookEvent::STATUS_IGNORED, 'Onboarding completed; Connect callback already persisted the merchant.'];
        }

        if (null === $merchantId) {
            return [PaypalWebhookEvent::STATUS_IGNORED, 'Revocation without a merchant id.'];
        }

        $account = $this->accounts->findOneByMerchantId($merchantId, StorePaymentAccount::PROVIDER_PAYPAL);
        if (!$account instanceof StorePaymentAccount) {
            return [PaypalWebhookEvent::STATUS_IGNORED, 'No connected PayPal account for merchant '.$merchantId];
        }

        $account->setLastError('Access was revoked from PayPal. Reconnect to keep taking PayPal payments.')
            ->markDisconnected();

        return [PaypalWebhookEvent::STATUS_PROCESSED, 'Disconnected store '.($account->getStore()?->getSlug() ?? '?')];
    }

    /**
     * @param array<string, mixed> $resource
     *
     * @return array{0: string, 1: string|null}
     */
    private function handleRefund(array $resource): array
    {
        $captureId = $this->nullableString($resource['id'] ?? $resource['capture_id'] ?? $resource['invoice_id'] ?? null);
        $links = is_array($resource['links'] ?? null) ? $resource['links'] : [];
        foreach ($links as $link) {
            if (is_array($link) && 'up' === ($link['rel'] ?? '') && is_string($link['href'] ?? null)) {
                if (preg_match('#/captures/([^/]+)#', (string) $link['href'], $matches)) {
                    $captureId = $matches[1];
                    break;
                }
            }
        }

        if (null === $captureId) {
            return [PaypalWebhookEvent::STATUS_IGNORED, 'Refund without a capture id.'];
        }

        $order = $this->orders->findOneBy(['paymentReference' => $captureId]);
        if (!$order instanceof Order) {
            return [PaypalWebhookEvent::STATUS_IGNORED, 'No order for capture '.$captureId];
        }

        if (!$order->getStatus()->canTransitionTo(OrderStatus::REFUNDED)) {
            return [PaypalWebhookEvent::STATUS_IGNORED, 'Order '.$order->getReference().' is already '.$order->getStatus()->value];
        }

        $order->setStatus(OrderStatus::REFUNDED);
        $this->stockReleaser->release($order);

        return [PaypalWebhookEvent::STATUS_PROCESSED, 'Refunded order '.$order->getReference()];
    }

    /**
     * @param array<string, mixed> $resource
     *
     * @return array{0: string, 1: string|null}
     */
    private function handleDispute(array $resource): array
    {
        $captureId = $this->nullableString(
            $resource['disputed_transactions'][0]['seller_transaction_id']
            ?? $resource['dispute_id']
            ?? null,
        );

        $order = null === $captureId ? null : $this->orders->findOneBy(['paymentReference' => $captureId]);
        $reference = $order instanceof Order ? $order->getReference() : 'unknown order';

        $this->logger->warning('PayPal dispute opened', [
            'capture' => $captureId,
            'order' => $reference,
            'reason' => $resource['reason'] ?? null,
        ]);

        if ($order instanceof Order) {
            $order->markDisputed((string) ($resource['reason'] ?? 'paypal_dispute'));
        }

        return [PaypalWebhookEvent::STATUS_PROCESSED, 'Dispute recorded for '.$reference];
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
