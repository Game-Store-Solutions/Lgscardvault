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
use App\Service\CaseCards\SectionSaleAllocator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Email;

/** @implements ProcessorInterface<Order, Order> */
final readonly class StoreOrderStatusProcessor implements ProcessorInterface
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private UserRepository $userRepository,
        private CustomerNotificationRepository $notificationRepository,
        private SectionSaleAllocator $sectionSaleAllocator,
        private MailerInterface $mailer,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): Order
    {
        if (!$data instanceof Order) {
            throw new \InvalidArgumentException('Expected Order.');
        }

        $originalStatus = $this->entityManager->getUnitOfWork()->getOriginalEntityData($data)['status'] ?? null;
        $this->createFulfilledNotificationIfNeeded($data, $originalStatus);
        $this->releaseCasePoolsIfNeeded($data, $originalStatus);

        $this->entityManager->persist($data);
        $this->entityManager->flush();

        return $data;
    }

    /**
     * Entering CANCELLED/REFUNDED returns each line's stock: the purchased
     * copies go back onto the inventory listing (checkout consumed them at
     * placement), and case copies go back to their section pool. Both states
     * are terminal in the status state machine, so stock can never be
     * double-restored.
     */
    private function releaseCasePoolsIfNeeded(Order $order, mixed $originalStatus): void
    {
        if (!$order->getStatus()->returnsStock()) {
            return;
        }
        if ($originalStatus instanceof OrderStatus && $originalStatus->returnsStock()) {
            return;
        }

        foreach ($order->getLines() as $line) {
            $item = $line->getInventoryItem();
            if (null !== $item) {
                $item->setQuantity($item->getQuantity() + $line->getQuantity());
            }
            $this->sectionSaleAllocator->releaseLine($line);
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

        $title = 'Order fulfilled';
        $body = sprintf('Your order %s from %s has been fulfilled.', $order->getReference(), $store->getName() ?? 'this store');

        $notification = (new CustomerNotification())
            ->setUser($user)
            ->setStore($store)
            ->setRelatedOrder($order)
            ->setType(CustomerNotification::TYPE_ORDER_FULFILLED)
            ->setTitle($title)
            ->setBody($body);

        $this->entityManager->persist($notification);
        $this->sendFulfilledEmail($order, $user, $store, $title, $body);
    }

    private function sendFulfilledEmail(Order $order, User $user, Store $store, string $title, string $body): void
    {
        $email = $user->getEmail();
        if (null === $email || '' === $email) {
            return;
        }

        try {
            $this->mailer->send((new Email())
                ->from('no-reply@store.local')
                ->to($email)
                ->subject(sprintf('%s - %s', $title, $order->getReference()))
                ->text(sprintf(
                    "%s\n\nOrder: %s\nStore: %s\nTotal: $%0.2f\n\nYou can view this order from your account page.",
                    $body,
                    $order->getReference(),
                    $store->getName() ?? 'Store',
                    $order->getTotalCents() / 100,
                )));
        } catch (TransportExceptionInterface) {
            // Local notifications should still be created if Mailpit is not running.
        }
    }
}
