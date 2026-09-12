<?php

namespace App\Service\Notification;

use App\Entity\Card;
use App\Entity\CustomerNotification;
use App\Entity\CustomerSetAlert;
use App\Entity\Store;
use App\Entity\User;
use App\Repository\CustomerNotificationRepository;
use App\Repository\CustomerSetAlertRepository;
use App\Service\Mail\TransactionalMailer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

/**
 * Store + set watches: any stock-in of that set notifies subscribers.
 * One unread wave per (user, store, set); later cards bump the count.
 * A new wave (and email) starts only after the last notice was read.
 *
 * CSV batches call this once per line. Watches are loaded once per store,
 * and open waves stay in memory so later cards do not re-query.
 */
final class SetAlertNotifier
{
    /** @var array<int, list<CustomerSetAlert>> */
    private array $watchesByStore = [];

    /** @var array<string, CustomerNotification> */
    private array $openWaves = [];

    public function __construct(
        private readonly CustomerSetAlertRepository $alerts,
        private readonly CustomerNotificationRepository $notifications,
        private readonly TransactionalMailer $mail,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    public function notifyStocked(Store $store, Card $card, ?User $exceptUser = null): void
    {
        $setCode = trim((string) $card->getSetCode());
        $game = $card->resolvedGameCode();
        if ('' === $setCode || '' === $game) {
            return;
        }

        $watches = $this->watchesForSet($store, $game, $setCode);
        if ([] === $watches) {
            return;
        }

        $label = strtoupper($setCode);
        $storeName = $store->getName() ?? 'a store';
        $title = sprintf('%s just arrived at %s', $label, $storeName);

        $pending = [];
        foreach ($watches as $watch) {
            $user = $watch->getUser();
            if (!$user instanceof User || null === $user->getId()) {
                continue;
            }
            if ($exceptUser instanceof User && $user->getId() === $exceptUser->getId()) {
                continue;
            }
            $key = $this->waveKey($user, $store, $title);
            $open = $this->openWaves[$key] ?? null;
            if ($open instanceof CustomerNotification) {
                $this->bump($open, $label, $storeName);
                continue;
            }
            $pending[] = $watch;
        }

        if ([] === $pending) {
            return;
        }

        $users = [];
        foreach ($pending as $watch) {
            $user = $watch->getUser();
            if ($user instanceof User) {
                $users[] = $user;
            }
        }
        $latest = $this->notifications->findLatestByTitleForUsers(
            $users,
            $store,
            CustomerNotification::TYPE_SET_RESTOCK,
            $title,
        );

        foreach ($pending as $watch) {
            $this->openOrStartWave($watch, $store, $title, $label, $storeName, $latest);
        }
    }

    /**
     * @param array<int, CustomerNotification> $latest
     */
    private function openOrStartWave(
        CustomerSetAlert $watch,
        Store $store,
        string $title,
        string $setLabel,
        string $storeName,
        array $latest,
    ): void {
        $user = $watch->getUser();
        if (!$user instanceof User || null === $user->getId()) {
            return;
        }

        $key = $this->waveKey($user, $store, $title);
        $existing = $latest[$user->getId()] ?? null;
        if ($existing instanceof CustomerNotification && null === $existing->getReadAt()) {
            $this->bump($existing, $setLabel, $storeName);
            $this->openWaves[$key] = $existing;

            return;
        }

        $notification = (new CustomerNotification())
            ->setUser($user)
            ->setStore($store)
            ->setType(CustomerNotification::TYPE_SET_RESTOCK)
            ->setTitle($title)
            ->setBody($this->body(1, $setLabel, $storeName));

        $this->entityManager->persist($notification);
        $this->openWaves[$key] = $notification;

        try {
            $this->mail->sendSetRestock($user, $store, $setLabel, $watch->getSetName());
        } catch (TransportExceptionInterface) {
            // In-app notification still saved if mail is down.
        }
    }

    private function bump(CustomerNotification $notification, string $setLabel, string $storeName): void
    {
        $notification->setBody($this->body($this->countFromBody($notification->getBody()) + 1, $setLabel, $storeName));
    }

    /** @return list<CustomerSetAlert> */
    private function watchesForSet(Store $store, string $game, string $setCode): array
    {
        $storeId = $store->getId();
        if (null === $storeId) {
            return [];
        }
        if (!isset($this->watchesByStore[$storeId])) {
            $this->watchesByStore[$storeId] = $this->alerts->findForStore($store);
        }

        $game = mb_strtolower(trim($game));
        $setCode = mb_strtolower(trim($setCode));
        $matches = [];
        foreach ($this->watchesByStore[$storeId] as $watch) {
            if ($watch->getGame() === $game && $watch->getSetCode() === $setCode) {
                $matches[] = $watch;
            }
        }

        return $matches;
    }

    private function waveKey(User $user, Store $store, string $title): string
    {
        return $user->getId().':'.$store->getId().':'.$title;
    }

    private function body(int $count, string $setLabel, string $storeName): string
    {
        $noun = 1 === $count ? 'card' : 'cards';
        $verb = 1 === $count ? 'was' : 'were';

        return sprintf('%d %s from %s %s added at %s.', $count, $noun, $setLabel, $verb, $storeName);
    }

    private function countFromBody(string $body): int
    {
        return preg_match('/^(\d+)/', $body, $match) ? max(1, (int) $match[1]) : 1;
    }
}
