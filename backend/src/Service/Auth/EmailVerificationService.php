<?php

namespace App\Service\Auth;

use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Issues and consumes one-time email-verification credentials: a clickable
 * 64-char link token (HMAC on the user row) and a 6-digit OTP (HMAC in cache)
 * so owner onboarding can stay in the wizard.
 */
final class EmailVerificationService
{
    public const TTL_SECONDS = 86400;
    public const GENERIC_SENT = 'If that email needs verification, we sent a code.';
    public const INVALID_LINK = 'This verification link is invalid or has expired.';
    public const INVALID_CODE = 'That code is invalid or has expired.';

    public function __construct(
        private readonly UserRepository $users,
        private readonly EntityManagerInterface $entityManager,
        #[Autowire('%kernel.secret%')]
        private readonly string $appSecret,
        #[Autowire(service: 'cache.app')]
        private readonly CacheItemPoolInterface $cache,
    ) {
    }

    /**
     * @return array{token: string, otp: string}
     */
    public function issue(User $user): array
    {
        $raw = bin2hex(random_bytes(32));
        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $user->setEmailVerifyToken($this->hashToken($raw));
        $user->setEmailVerifyExpiresAt(new \DateTimeImmutable('+'.self::TTL_SECONDS.' seconds'));
        $this->entityManager->flush();

        $item = $this->cache->getItem($this->otpCacheKey($user));
        $item->set($this->hashToken($otp));
        $item->expiresAfter(self::TTL_SECONDS);
        $this->cache->save($item);

        return ['token' => $raw, 'otp' => $otp];
    }

    /** @deprecated use {@see issue()} */
    public function issueToken(User $user): string
    {
        return $this->issue($user)['token'];
    }

    /** Mark the matching user verified, or return an error message. */
    public function consume(string $rawToken): User|string
    {
        $user = $this->findUserForToken($rawToken);
        if (!$user instanceof User) {
            return self::INVALID_LINK;
        }

        return $this->complete($user, self::INVALID_LINK);
    }

    public function consumeOtp(string $email, string $code): User|string
    {
        $code = preg_replace('/\D+/', '', $code) ?? '';
        if (6 !== strlen($code)) {
            return self::INVALID_CODE;
        }

        $user = $this->users->findOneByEmailInsensitive(trim($email));
        if (!$user instanceof User || $user->isEmailVerified()) {
            return self::INVALID_CODE;
        }

        $item = $this->cache->getItem($this->otpCacheKey($user));
        if (!$item->isHit() || !hash_equals((string) $item->get(), $this->hashToken($code))) {
            return self::INVALID_CODE;
        }

        return $this->complete($user, self::INVALID_CODE);
    }

    private function complete(User $user, string $expiredMessage): User|string
    {
        $expires = $user->getEmailVerifyExpiresAt();
        if (!$expires instanceof \DateTimeImmutable || $expires < new \DateTimeImmutable()) {
            $user->setEmailVerifyToken(null);
            $user->setEmailVerifyExpiresAt(null);
            $this->entityManager->flush();
            $this->cache->deleteItem($this->otpCacheKey($user));

            return $expiredMessage;
        }

        $user->markEmailVerified();
        $this->entityManager->flush();
        $this->cache->deleteItem($this->otpCacheKey($user));

        return $user;
    }

    private function hashToken(string $raw): string
    {
        return hash_hmac('sha256', $raw, $this->appSecret);
    }

    private function otpCacheKey(User $user): string
    {
        return 'email_verify_otp_'.(int) $user->getId();
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
