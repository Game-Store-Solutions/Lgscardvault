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

use App\Service\Payments\CheckoutGatewayInterface;

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

        private CheckoutGatewayInterface $checkoutGateway,

    ) {

    }



    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): Order

    {

        if (!$data instanceof Order) {

            throw new \InvalidArgumentException('Expected Order.');

        }



        $originalStatus = $this->entityManager->getUnitOfWork()->getOriginalEntityData($data)['status'] ?? null;

        $this->createFulfilledNotificationIfNeeded($data, $originalStatus);

        // Square refund first — if it fails, leave the order and stock alone.

        $this->refundSquarePaymentIfNeeded($data, $originalStatus);

        $this->releaseCasePoolsIfNeeded($data, $originalStatus);



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



        $paymentId = $order->getPaymentReference();

        $paidCents = $order->getPaidCents();

        if (null === $paymentId || '' === $paymentId || $paidCents < 1) {

            return;

        }



        $store = $order->getStore();

        if (!$store instanceof Store) {

            throw new BadRequestHttpException('Order has no store.');

        }



        try {

            $result = $this->checkoutGateway->refund(

                $store,

                $paymentId,

                $paidCents,

                'refund-'.$order->getReference(),

                sprintf('Order %s marked %s', $order->getReference(), $order->getStatus()->value),

            );

        } catch (\RuntimeException $e) {

            throw new BadRequestHttpException($e->getMessage(), $e);

        }



        $status = strtoupper($result['status']);

        if (in_array($status, ['FAILED', 'REJECTED'], true)) {

            throw new BadRequestHttpException('Square could not refund this payment. Try again from the Square dashboard.');

        }

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

}


