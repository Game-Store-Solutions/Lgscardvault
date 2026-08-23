<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Store;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

/** @implements ProcessorInterface<Store, Store> */
final readonly class StoreAdminProcessor implements ProcessorInterface
{
    public function __construct(
        private EntityManagerInterface $entityManager,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): Store
    {
        if (!$data instanceof Store) {
            throw new \InvalidArgumentException('Expected Store.');
        }

        if (null === $data->getId()) {
            $this->entityManager->persist($data);
        }

        if ($data->isActive() && Store::STATUS_APPROVED !== $data->getStatus()) {
            throw new UnprocessableEntityHttpException(
                'Pending or rejected stores must be approved after license review.',
            );
        }

        $owner = $data->getOwner();
        if ($owner instanceof User) {
            $roles = $owner->getRoles();
            if (!in_array('ROLE_STORE_OWNER', $roles, true)) {
                $roles[] = 'ROLE_STORE_OWNER';
                $owner->setRoles(array_values(array_filter(
                    $roles,
                    static fn (string $role): bool => 'ROLE_USER' !== $role,
                )));
            }
        }

        $this->entityManager->flush();

        return $data;
    }
}
