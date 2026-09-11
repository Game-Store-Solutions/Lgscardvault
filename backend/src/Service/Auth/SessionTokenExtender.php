<?php

namespace App\Service\Auth;

use App\Entity\User;
use App\Repository\UserRepository;
use Lcobucci\JWT\Encoding\JoseEncoder;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Signer\Rsa\Sha256;
use Lcobucci\JWT\Token\Parser;
use Lcobucci\JWT\Token\RegisteredClaims;
use Lcobucci\JWT\Validation\Constraint\SignedWith;
use Lcobucci\JWT\Validation\Validator;
use Lexik\Bundle\JWTAuthenticationBundle\Services\KeyLoader\KeyLoaderInterface;

/**
 * Re-issues a JWT from a recently expired (but still signed) access token.
 * Powers the storefront "Are you still there?" modal without a password prompt.
 */
final class SessionTokenExtender
{
    /** How long after `exp` a resume is still accepted (modal is 30s; leave headroom). */
    public const GRACE_SECONDS = 600;

    public function __construct(
        private readonly KeyLoaderInterface $keyLoader,
        private readonly UserRepository $users,
    ) {
    }

    public function userFromResumeToken(string $token): ?User
    {
        $token = trim($token);
        if ('' === $token) {
            return null;
        }

        try {
            $parsed = (new Parser(new JoseEncoder()))->parse($token);
        } catch (\Throwable) {
            return null;
        }

        $key = InMemory::plainText($this->keyLoader->loadKey(KeyLoaderInterface::TYPE_PUBLIC));
        $validator = new Validator();
        if (!$validator->validate($parsed, new SignedWith(new Sha256(), $key))) {
            return null;
        }

        if (!$parsed->claims()->has(RegisteredClaims::EXPIRATION_TIME)) {
            return null;
        }

        $exp = $parsed->claims()->get(RegisteredClaims::EXPIRATION_TIME);
        if (!$exp instanceof \DateTimeInterface) {
            return null;
        }

        // Reject tokens that expired too long ago (stolen JWT left lying around).
        if ($exp->getTimestamp() + self::GRACE_SECONDS < time()) {
            return null;
        }

        $username = null;
        if ($parsed->claims()->has('username')) {
            $username = $parsed->claims()->get('username');
        } elseif ($parsed->claims()->has(RegisteredClaims::SUBJECT)) {
            $username = $parsed->claims()->get(RegisteredClaims::SUBJECT);
        }

        if (!is_string($username) || '' === trim($username)) {
            return null;
        }

        $user = $this->users->findOneBy(['email' => trim($username)]);
        if (!$user instanceof User || !$user->isEmailVerified()) {
            return null;
        }

        return $user;
    }
}
