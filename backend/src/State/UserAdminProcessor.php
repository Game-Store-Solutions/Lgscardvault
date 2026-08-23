<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\Auth\AgeAttestation;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
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
        private RequestStack $requestStack,
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

        $this->applySubmittedDateOfBirth($data);

        if (null === $data->getId()) {
            $this->entityManager->persist($data);
        }

        $this->entityManager->flush();

        return $data;
    }

    private function applySubmittedDateOfBirth(User $data): void
    {
        $request = $this->requestStack->getCurrentRequest();
        $payload = $request instanceof Request
            ? json_decode($request->getContent() ?: '', true)
            : null;
        $submitted = is_array($payload) && array_key_exists('dateOfBirth', $payload);

        if ($submitted) {
            $raw = $payload['dateOfBirth'];
            if (null === $raw || '' === $raw) {
                if (null === $data->getId()) {
                    throw new UnprocessableEntityHttpException(
                        'Date of birth (YYYY-MM-DD) is required. Users must be at least 13.',
                    );
                }

                return;
            }
            try {
                $data->setDateOfBirth(AgeAttestation::parse($raw));
            } catch (\InvalidArgumentException $e) {
                throw new UnprocessableEntityHttpException($e->getMessage());
            }
        }

        $this->assertAdultDateOfBirth($data);
    }

    private function assertAdultDateOfBirth(User $data): void
    {
        $dob = $data->getDateOfBirth();
        if (!$dob instanceof \DateTimeImmutable) {
            if (null === $data->getId()) {
                throw new UnprocessableEntityHttpException(
                    'Date of birth (YYYY-MM-DD) is required. Users must be at least 13.',
                );
            }

            return;
        }

        try {
            AgeAttestation::parse($dob->format('Y-m-d'));
        } catch (\InvalidArgumentException $e) {
            throw new UnprocessableEntityHttpException($e->getMessage());
        }
    }
}
