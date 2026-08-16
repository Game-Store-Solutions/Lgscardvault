<?php

namespace App\Service\Auth;

use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Issues and consumes one-time email-verification tokens. Same storage rules
 * as password reset: only an HMAC of the emailed token is persisted.
 */
final class EmailVerificationService
{
    public const TTL_SECONDS = 86400;
    public const GENERIC_SENT = 'If that email needs verification, we sent a link.';
    public const INVALID_LINK = 'This verification link is invalid or has expired.';

    public function __construct(
        private readonly UserRepository $users,
        private readonly EntityManagerInterface $entityManager,
        #[Autowire('%kernel.secret%')]
        private readonly string $appSecret,
    ) {
    }

    public function issueToken(User $user): string
    {
        $raw = bin2hex(random_bytes(32));
        $user->setEmailVerifyToken($this->hashToken($raw));
        $user->setEmailVerifyExpiresAt(new \DateTimeImmutable('+'.self::TTL_SECONDS.' seconds'));
        $this->entityManager->flush();

        return $raw;
    }

    /** Mark the matching user verified, or return an error message. */
    public function consume(string $rawToken): User|string
    {
        $user = $this->findUserForToken($rawToken);
        if (!$user instanceof User) {
            return self::INVALID_LINK;
        }

        $expires = $user->getEmailVerifyExpiresAt();
        if (!$expires instanceof \DateTimeImmutable || $expires < new \DateTimeImmutable()) {
            $user->setEmailVerifyToken(null);
            $user->setEmailVerifyExpiresAt(null);
            $this->entityManager->flush();

            return self::INVALID_LINK;
        }

        $user->markEmailVerified();
        $this->entityManager->flush();

        return $user;
    }

    private function hashToken(string $raw): string
    {
        return hash_hmac('sha256', $raw, $this->appSecret);
    }

    private function findUserForToken(string $rawToken): ?User
    {
        $rawToken = trim($rawToken);
        if (64 !== strlen($rawToken) || 1 !== preg_match('/^[a-f0-9]+$/', $rawToken)) {
            return null;
        }

        return $this->users->findOneBy(['emailVerifyToken' => $this->hashToken($rawToken)]);
    }
}
