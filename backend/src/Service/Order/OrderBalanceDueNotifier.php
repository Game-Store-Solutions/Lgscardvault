<?php

namespace App\Service\Order;

use App\Entity\CustomerNotification;
use App\Entity\Order;
use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use App\Entity\User;
use App\Repository\CustomerNotificationRepository;
use App\Repository\UserRepository;
use App\Service\Mail\TransactionalMailer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

/**
 * When staff add cards to a captured PayPal order, ask the shopper to approve
 * the extra once — in-app bell + email for accounts, email-only magic link for guests.
 */
final readonly class OrderBalanceDueNotifier
{
    public function __construct(
        private UserRepository $users,
        private CustomerNotificationRepository $notifications,
        private TransactionalMailer $mail,
        private OrderBalanceDueToken $balanceDueToken,
        private EntityManagerInterface $entityManager,
    ) {
    }

    public function sync(Order $order): void
    {
        $due = $order->getBalanceDueCents();
        $paypal = StorePaymentAccount::PROVIDER_PAYPAL === $order->getPaymentProvider();
        if (!$paypal || $due < 1) {
            $this->clear($order);

            return;
        }

        $store = $order->getStore();
        $email = $order->getCustomerEmail();
        if (!$store instanceof Store || null === $email || '' === $email) {
            return;
        }

        $user = $this->users->findOneBy(['email' => $email]);
        if ($user instanceof User) {
            $this->syncRegisteredShopper($order, $store, $user, $due);

            return;
        }

        $this->syncGuestShopper($order, $store, $email, $due);
    }

    private function syncRegisteredShopper(Order $order, Store $store, User $user, int $due): void
    {
        $title = 'PayPal approval needed';
        $amount = number_format($due / 100, 2);
        $body = sprintf(
            '%s added cards to order %s. Approve $%s on PayPal from your account.',
            $store->getName() ?? 'The store',
            $order->getReference(),
            $amount,
        );

        $existing = $this->notifications->findOneForOrder($user, $order, CustomerNotification::TYPE_ORDER_BALANCE_DUE);
        $wasRead = $existing instanceof CustomerNotification && null !== $existing->getReadAt();
        $isNew = !$existing instanceof CustomerNotification;

        if ($existing instanceof CustomerNotification) {
            $existing->setTitle($title)->setBody($body);
            if ($wasRead) {
                $existing->markUnread();
            }
        } else {
            $existing = (new CustomerNotification())
                ->setUser($user)
                ->setStore($store)
                ->setRelatedOrder($order)
                ->setType(CustomerNotification::TYPE_ORDER_BALANCE_DUE)
                ->setTitle($title)
                ->setBody($body);
            $this->entityManager->persist($existing);
        }

        if ($isNew || $wasRead) {
            $this->sendRegisteredEmail($order, $user, $store, $due);
        }
    }

    private function syncGuestShopper(Order $order, Store $store, string $email, int $due): void
    {
        if ($order->getBalanceDueNotifiedCents() === $due) {
            return;
        }

        try {
            $token = $this->balanceDueToken->create($order);
            $payUrl = $this->mail->orderBalanceDueGuestUrl($store, $order, $token);
            $this->mail->sendOrderBalanceDueToEmail(
                $order,
                $email,
                $order->getCustomerName() ?: 'there',
                $store,
                $due,
                $payUrl,
            );
            $order->setBalanceDueNotifiedCents($due);
        } catch (TransportExceptionInterface|\InvalidArgumentException) {
            // Leave balance_due_notified_cents unset so a later edit can retry.
        }
    }

    private function sendRegisteredEmail(Order $order, User $user, Store $store, int $due): void
    {
        try {
            $this->mail->sendOrderBalanceDue($order, $user, $store, $due);
        } catch (TransportExceptionInterface) {
            // Bell still saved if Mailpit / SMTP is down.
        }
    }

    private function clear(Order $order): void
    {
        $order->setBalanceDueNotifiedCents(null);

        $email = $order->getCustomerEmail();
        if (null === $email || '' === $email) {
            return;
        }

        $user = $this->users->findOneBy(['email' => $email]);
        if (!$user instanceof User) {
            return;
        }

        $existing = $this->notifications->findOneForOrder($user, $order, CustomerNotification::TYPE_ORDER_BALANCE_DUE);
        $existing?->markRead();
    }
}
