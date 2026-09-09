<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\CustomerNotification;
use App\Entity\Order;
use App\Entity\Store;
use App\Entity\User;
use App\Enum\OrderStatus;
use App\Repository\CustomerNotificationRepository;
use App\Repository\UserRepository;
use App\Service\Checkout\OrderStockReleaser;
use App\Service\Mail\TransactionalMailer;
use App\Service\Order\OrderBalanceDueNotifier;
use App\Service\Order\OrderPaymentAdjuster;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

/** @implements ProcessorInterface<Order, Order> */
final readonly class StoreOrderStatusProcessor implements ProcessorInterface
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private UserRepository $userRepository,
        private CustomerNotificationRepository $notificationRepository,
        private OrderStockReleaser $stockReleaser,
        private TransactionalMailer $mail,
        private OrderPaymentAdjuster $paymentAdjuster,
        private OrderBalanceDueNotifier $balanceDueNotifier,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): Order
    {
        if (!$data instanceof Order) {
            throw new \InvalidArgumentException('Expected Order.');
        }

        $originalStatus = $this->entityManager->getUnitOfWork()->getOriginalEntityData($data)['status'] ?? null;
        $this->assertCanFulfill($data, $originalStatus);
        $this->createFulfilledNotificationIfNeeded($data, $originalStatus);
        $this->notifyOrderCancelledIfNeeded($data, $originalStatus);

        // Square refund first — if it fails, leave the order and stock alone.
        $this->refundSquarePaymentIfNeeded($data, $originalStatus);
        $this->releaseCasePoolsIfNeeded($data, $originalStatus);
        $this->clearBalanceDueAlertsIfNeeded($data, $originalStatus);

        $this->entityManager->persist($data);
        $this->entityManager->flush();

        return $data;
    }

    /**
     * Entering CANCELLED/REFUNDED returns each line's stock and any store
     * credit spent. Both states are terminal in the status state machine, so
     * stock can never be double-restored.
     */
    private function releaseCasePoolsIfNeeded(Order $order, mixed $originalStatus): void
    {
        if (!$order->getStatus()->returnsStock()) {
            return;
        }
        if ($originalStatus instanceof OrderStatus && $originalStatus->returnsStock()) {
            return;
        }

        $this->stockReleaser->release($order);
    }

    /**
     * Push a real Square refund when staff cancel/refund a card-captured order.
     * Kiosk / unpaid orders have no paymentReference and are skipped.
     */
    private function refundSquarePaymentIfNeeded(Order $order, mixed $originalStatus): void
    {
        if (!$order->getStatus()->returnsStock()) {
            return;
        }
        if ($originalStatus instanceof OrderStatus && $originalStatus->returnsStock()) {
            return;
        }

        try {
            $this->paymentAdjuster->refundRemaining($order, 'refund-'.$order->getReference());
        } catch (\RuntimeException $e) {
            throw new BadRequestHttpException($e->getMessage(), $e);
        }
    }

    private function assertCanFulfill(Order $order, mixed $originalStatus): void
    {
        if (!in_array($order->getStatus(), [OrderStatus::FULFILLED, OrderStatus::COMPLETED], true)) {
            return;
        }
        if ($originalStatus instanceof OrderStatus && $originalStatus === $order->getStatus()) {
            return;
        }

        // History CSV rows already happened offline — don't block staff from
        // walking them through Ready / Delivered when tax sync left a phantom balance.
        if ($order->isHistoricalImport()) {
            if (OrderStatus::COMPLETED === $order->getStatus() && $order->getBalanceDueCents() > 0) {
                $order->setPaidCents($order->amountDueCents());
            }

            return;
        }

        if ($order->getBalanceDueCents() > 0 && $order->getPaidCents() > 0) {
            throw new BadRequestHttpException(
                'This order still has an unpaid balance. Collect payment or wait for PayPal approval before marking it ready.',
            );
        }
    }

    private function clearBalanceDueAlertsIfNeeded(Order $order, mixed $originalStatus): void
    {
        if (!$order->getStatus()->returnsStock()) {
            return;
        }
        if ($originalStatus instanceof OrderStatus && $originalStatus->returnsStock()) {
            return;
        }

        $this->balanceDueNotifier->sync($order);
    }

    private function createFulfilledNotificationIfNeeded(Order $order, mixed $originalStatus): void
    {
        if (!in_array($order->getStatus(), [OrderStatus::FULFILLED, OrderStatus::COMPLETED], true)) {
            return;
        }
        if ($originalStatus instanceof OrderStatus && in_array($originalStatus, [OrderStatus::FULFILLED, OrderStatus::COMPLETED], true)) {
            return;
        }

        $email = $order->getCustomerEmail();
        $store = $order->getStore();
        if (null === $email || !$store instanceof Store) {
            return;
        }

        $user = $this->userRepository->findOneBy(['email' => $email]);
        if (!$user instanceof User) {
            return;
        }
        if ($this->notificationRepository->findOneForOrder($user, $order, CustomerNotification::TYPE_ORDER_FULFILLED) instanceof CustomerNotification) {
            return;
        }

        $title = 'Ready for pickup';
        $body = sprintf('Your order %s from %s is ready for pickup.', $order->getReference(), $store->getName() ?? 'this store');

        $notification = (new CustomerNotification())
            ->setUser($user)
            ->setStore($store)
            ->setRelatedOrder($order)
            ->setType(CustomerNotification::TYPE_ORDER_FULFILLED)
            ->setTitle($title)
            ->setBody($body);

        $this->entityManager->persist($notification);

        try {
            $this->mail->sendOrderFulfilled($order, $user, $store);
        } catch (TransportExceptionInterface) {
            // In-app notification still saved if Mailpit / SMTP is down.
        }
    }

    /**
     * Staff declined a new (pending) order — email the shopper (guest or
     * registered). In-app notice only when they have an account.
     */
    private function notifyOrderCancelledIfNeeded(Order $order, mixed $originalStatus): void
    {
        if (OrderStatus::CANCELLED !== $order->getStatus()) {
            return;
        }
        // Decline mail is for New orders (pending → cancelled), not later refunds.
        if (!$originalStatus instanceof OrderStatus || OrderStatus::PENDING !== $originalStatus) {
            return;
        }

        $email = $order->getCustomerEmail();
        $store = $order->getStore();
        if (null === $email || '' === $email || !$store instanceof Store) {
            return;
        }

        $user = $this->userRepository->findOneBy(['email' => $email]);
        if ($user instanceof User
            && !$this->notificationRepository->findOneForOrder($user, $order, CustomerNotification::TYPE_ORDER_CANCELLED) instanceof CustomerNotification
        ) {
            $title = 'Order declined';
            $body = sprintf(
                '%s declined your order %s.',
                $store->getName() ?? 'The store',
                $order->getReference() ?? '',
            );
            $notification = (new CustomerNotification())
                ->setUser($user)
                ->setStore($store)
                ->setRelatedOrder($order)
                ->setType(CustomerNotification::TYPE_ORDER_CANCELLED)
                ->setTitle($title)
                ->setBody($body);
            $this->entityManager->persist($notification);
        }

        try {
            $this->mail->sendOrderCancelled($order, $store, $user instanceof User ? $user : null);
        } catch (TransportExceptionInterface) {
            // Status change still stands if Mailpit / SMTP is down.
        }
    }
}
