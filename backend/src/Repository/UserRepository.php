<?php

namespace App\Repository;

use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Security\Core\Exception\UserNotFoundException;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\User\UserProviderInterface;

/**
 * @extends ServiceEntityRepository<User>
 */
class UserRepository extends ServiceEntityRepository implements UserProviderInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, User::class);
    }

    public function loadUserByIdentifier(string $identifier): UserInterface
    {
        $user = $this->findOneBy(['email' => $identifier]);
        if (!$user instanceof User) {
            throw new UserNotFoundException(sprintf('User "%s" not found.', $identifier));
        }

        return $user;
    }

    public function refreshUser(UserInterface $user): UserInterface
    {
        return $this->loadUserByIdentifier($user->getUserIdentifier());
    }

    public function supportsClass(string $class): bool
    {
        return User::class === $class || is_subclass_of($class, User::class);
    }

    /**
     * Case-insensitive email lookup. Order.customerEmail is free text (an
     * admin may type "John@Example.com"), so matching it back to an account
     * must ignore case — the same rule OrderRepository uses for the customer
     * order list.
     */
    public function findOneByEmailInsensitive(string $email): ?User
    {
        return $this->createQueryBuilder('u')
            ->andWhere('LOWER(u.email) = LOWER(:email)')
            ->setParameter('email', $email)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Platform admins are rare; CAST(roles AS TEXT) keeps the check portable
     * across PostgreSQL (prod) and SQLite (some local setups).
     */
    public function countSuperAdmins(?int $excludingUserId = null): int
    {
        $sql = 'SELECT COUNT(*) FROM users WHERE CAST(roles AS TEXT) LIKE :role';
        $params = ['role' => '%ROLE_SUPER_ADMIN%'];
        if (null !== $excludingUserId) {
            $sql .= ' AND id <> :excludeId';
            $params['excludeId'] = $excludingUserId;
        }

        return (int) $this->getEntityManager()->getConnection()->fetchOne($sql, $params);
    }

    public function save(User $user, bool $flush = false): void
    {
        $this->getEntityManager()->persist($user);
        if ($flush) {
            $this->getEntityManager()->flush();
        }
    }
}
