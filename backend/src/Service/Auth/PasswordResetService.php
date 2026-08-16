<?php

namespace App\Service\Auth;

use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Issues and consumes one-time password-reset tokens. The raw token is emailed
 * once; only an HMAC of it is stored, so a leaked users table cannot reset
 * anyone's password.
 */
final class PasswordResetService
{
    public const TTL_SECONDS = 3600;
    public const MIN_PASSWORD_LENGTH = 8;
    public const GENERIC_SENT = 'If that email is registered, we sent a reset link.';
    public const INVALID_LINK = 'This reset link is invalid or has expired.';

    public function __construct(
        private readonly UserRepository $users,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly EntityManagerInterface $entityManager,
        #[Autowire('%kernel.secret%')]
        private readonly string $appSecret,
    ) {
    }

    /** Create a fresh raw token for $user and persist its hash + expiry. */
    public function issueToken(User $user): string
    {
        $raw = bin2hex(random_bytes(32));
        $user->setPasswordResetToken($this->hashToken($raw));
        $user->setPasswordResetExpiresAt(new \DateTimeImmutable('+'.self::TTL_SECONDS.' seconds'));
        $this->entityManager->flush();

        return $raw;
    }

    /**
     * Apply a new password if the token is valid. Returns an error message, or
     * null on success.
     */
    public function reset(string $rawToken, string $plainPassword): ?string
    {
        if (mb_strlen($plainPassword) < self::MIN_PASSWORD_LENGTH) {
            return sprintf('Password must be at least %d characters.', self::MIN_PASSWORD_LENGTH);
        }

        $user = $this->findUserForToken($rawToken);
        if (!$user instanceof User) {
            return self::INVALID_LINK;
        }

        $expires = $user->getPasswordResetExpiresAt();
        if (!$expires instanceof \DateTimeImmutable || $expires < new \DateTimeImmutable()) {
            $user->clearPasswordReset();
            $this->entityManager->flush();

            return self::INVALID_LINK;
        }

        $user->setPassword($this->passwordHasher->hashPassword($user, $plainPassword));
        $user->clearPasswordReset();
        $user->markEmailVerified();
        $this->entityManager->flush();

        return null;
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

        return $this->users->findOneBy(['passwordResetToken' => $this->hashToken($rawToken)]);
    }
}
