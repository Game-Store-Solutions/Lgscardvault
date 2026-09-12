<?php

namespace App\Service\Customer;

use App\Entity\CustomerSetAlert;
use App\Entity\Game;
use App\Entity\Store;
use App\Entity\User;
use App\Repository\CustomerSetAlertRepository;
use App\Repository\GameSetRepository;
use Doctrine\ORM\EntityManagerInterface;

/** Subscribe / list / drop set restock watches. Callers own the flush. */
final readonly class SetAlertBook
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private CustomerSetAlertRepository $alerts,
        private GameSetRepository $gameSets,
    ) {
    }

    /** @return list<CustomerSetAlert> */
    public function list(User $user, ?Store $store = null, ?int $offset = null, ?int $limit = null): array
    {
        return $this->alerts->findForUser($user, $store, $offset, $limit);
    }

    public function count(User $user, ?Store $store = null): int
    {
        return $this->alerts->countForUser($user, $store);
    }

    public function subscribe(User $user, Store $store, Game $game, string $setCode): CustomerSetAlert
    {
        $code = mb_strtolower(trim($setCode));
        if ('' === $code) {
            throw new \InvalidArgumentException('Pick a set.');
        }

        $existing = $this->alerts->findWatch($user, $store, $game->getCode(), $code);
        if ($existing instanceof CustomerSetAlert) {
            return $existing;
        }

        $named = $this->gameSets->findOneByGameAndCode($game, $code);
        $alert = (new CustomerSetAlert())
            ->setUser($user)
            ->setStore($store)
            ->setGame($game->getCode())
            ->setSetCode($code)
            ->setSetName($named?->getName() ?: strtoupper($code));

        $this->entityManager->persist($alert);

        return $alert;
    }

    public function unsubscribe(User $user, int $id): bool
    {
        $alert = $this->alerts->find($id);
        if (!$alert instanceof CustomerSetAlert || $alert->getUser()?->getId() !== $user->getId()) {
            return false;
        }

        $this->entityManager->remove($alert);

        return true;
    }

    /** @return array<string, mixed> */
    public function serialize(CustomerSetAlert $alert): array
    {
        $store = $alert->getStore();

        return [
            'id' => $alert->getId(),
            'game' => $alert->getGame(),
            'setCode' => $alert->getSetCode(),
            'setName' => $alert->getSetName(),
            'storeSlug' => $store?->getSlug(),
            'storeName' => $store?->getName(),
            'createdAt' => $alert->getCreatedAt()->format(\DATE_ATOM),
        ];
    }
}
