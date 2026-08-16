<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/** @implements ProcessorInterface<User, User> */
final readonly class UserAdminProcessor implements ProcessorInterface
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private UserPasswordHasherInterface $passwordHasher,
        private Security $security,
        private UserRepository $users,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): User
    {
        if (!$data instanceof User) {
            throw new \InvalidArgumentException('Expected User.');
        }

        $currentUser = $this->security->getUser();
        $isSelf = $currentUser instanceof User && $currentUser->getId() === $data->getId();
        $keepsSuperAdmin = in_array('ROLE_SUPER_ADMIN', $data->getRoles(), true);

        if ($isSelf && !$keepsSuperAdmin) {
            throw new UnprocessableEntityHttpException('You cannot remove your own platform-admin role.');
        }

        // Unit of Work may already hold the demoted roles; compare against the DB original.
        if (null !== $data->getId() && !$keepsSuperAdmin) {
            $original = $this->entityManager->getUnitOfWork()->getOriginalEntityData($data);
            $hadSuperAdmin = in_array('ROLE_SUPER_ADMIN', $original['roles'] ?? [], true);
            if ($hadSuperAdmin && $this->users->countSuperAdmins((int) $data->getId()) < 1) {
                throw new ConflictHttpException('Cannot remove the last platform admin.');
            }
        }

        if ($email = $data->getEmail()) {
            $existing = $this->users->findOneByEmailInsensitive($email);
            if ($existing instanceof User && $existing->getId() !== $data->getId()) {
                throw new ConflictHttpException('Another account already uses that email.');
            }
        }

        if ($plainPassword = $data->getPlainPassword()) {
            $data->setPassword($this->passwordHasher->hashPassword($data, $plainPassword));
            $data->clearPasswordReset();
            $data->eraseCredentials();
        }

        if (null === $data->getId()) {
            $this->entityManager->persist($data);
        }

        $this->entityManager->flush();

        return $data;
    }
}
