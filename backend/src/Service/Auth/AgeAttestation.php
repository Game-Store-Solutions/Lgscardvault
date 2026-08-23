<?php

namespace App\Service\Auth;

use App\Entity\User;

/** Shared 13+ date-of-birth parsing for password signup and SSO completion. */
final class AgeAttestation
{
    public static function parse(mixed $raw): \DateTimeImmutable
    {
        $dobRaw = trim((string) $raw);
        $dateOfBirth = \DateTimeImmutable::createFromFormat('!Y-m-d', $dobRaw) ?: null;
        if (!$dateOfBirth instanceof \DateTimeImmutable || $dateOfBirth->format('Y-m-d') !== $dobRaw) {
            throw new \InvalidArgumentException('Enter your date of birth (YYYY-MM-DD).');
        }

        $age = User::ageYears($dateOfBirth);
        if ($age < 13) {
            throw new \InvalidArgumentException('You must be at least 13 years old to create an account.');
        }
        if ($age > 120) {
            throw new \InvalidArgumentException('Please enter a valid date of birth.');
        }

        return $dateOfBirth;
    }
}
