<?php

namespace App\Service\User;

use App\Entity\Store;
use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\Auth\AgeAttestation;
use App\Service\Auth\PasswordResetService;
use App\Service\CsvImport\CsvGrid;
use App\Service\Mail\TransactionalMailer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Platform-admin CSV import for accounts from a previous site.
 *
 * Old password hashes cannot be reused. Rows may include a temporary plaintext
 * password; otherwise a random unusable password is stored and the shopper
 * sets a real one via the emailed reset link (or Forgot password).
 */
final class UserCsvImporter
{
    public const MAX_ROWS = 2000;
    public const MAX_RESET_EMAILS = 200;
    public const MIN_PASSWORD_LENGTH = 8;

    /** Shared bcrypt/argon hash for accounts that will set a password via reset email. */
    private ?string $sharedUnusablePasswordHash = null;

    /** @var array<string, string> */
    private const HEADER_ALIASES = [
        'email' => 'email',
        'emailaddress' => 'email',
        'useremail' => 'email',
        'customeremail' => 'email',
        'memberemail' => 'email',
        'custemail' => 'email',
        'mail' => 'email',
        'login' => 'email',
        'displayname' => 'displayName',
        'name' => 'displayName',
        'fullname' => 'displayName',
        'username' => 'displayName',
        'firstname' => 'firstName',
        'givenname' => 'firstName',
        'lastname' => 'lastName',
        'surname' => 'lastName',
        'password' => 'password',
        'pass' => 'password',
        'roles' => 'roles',
        'role' => 'roles',
        'access' => 'roles',
        'emailverified' => 'emailVerified',
        'verified' => 'emailVerified',
        'isverified' => 'emailVerified',
        'dateofbirth' => 'dateOfBirth',
        'dob' => 'dateOfBirth',
        'birthday' => 'dateOfBirth',
        'birthdate' => 'dateOfBirth',
    ];

    public function __construct(
        private readonly CsvGrid $grid,
        private readonly UserRepository $users,
        private readonly EntityManagerInterface $entityManager,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly PasswordResetService $passwordReset,
        private readonly TransactionalMailer $mail,
    ) {
    }

    /**
     * @return array{
     *     created: int,
     *     skipped: int,
     *     resetEmailsSent: int,
     *     resetEmailsOmitted: int,
     *     dryRun: bool,
     *     errors: list<array{row: int, email: ?string, message: string}>,
     *     warnings: list<array{row: int, email: ?string, message: string}>
     * }
     */
    public function import(
        string $csv,
        bool $dryRun = false,
        bool $sendResetEmails = true,
        bool $allowPlatformAdmins = false,
        ?Store $brandStore = null,
    ): array {
        // Bulk imports hash passwords and may email resets — avoid the default 30s cap.
        if (\function_exists('set_time_limit')) {
            @set_time_limit(300);
        }

        $this->sharedUnusablePasswordHash = null;
        $csv = $this->decodeCsvBytes($csv);
        $grid = $this->grid->toRows($csv, self::MAX_ROWS);
        if (count($grid) < 2) {
            throw new \InvalidArgumentException('CSV must have a header row and at least one data row.');
        }
        if (count($grid) > self::MAX_ROWS + 1) {
            throw new \InvalidArgumentException(sprintf('CSV exceeds the maximum of %d users.', self::MAX_ROWS));
        }

        $index = $this->headerIndex($grid[0]);
        if (!isset($index['email'])) {
            throw new \InvalidArgumentException('CSV must include an "email" column.');
        }

        $created = 0;
        $skipped = 0;
        $resetEmailsSent = 0;
        $resetEmailsOmitted = 0;
        $errors = [];
        $warnings = [];
        $seenInFile = [];
        /** @var list<array{user: User, row: int, email: string}> $pendingResets */
        $pendingResets = [];

        foreach (array_slice($grid, 1) as $offset => $cols) {
            $rowNumber = $offset + 2;
            $cell = static fn (string $key): string => isset($index[$key])
                ? trim((string) ($cols[$index[$key]] ?? ''))
                : '';

            $email = mb_strtolower($cell('email'));
            if ('' === $email) {
                $errors[] = ['row' => $rowNumber, 'email' => null, 'message' => 'Email is required.'];
                continue;
            }
            if (false === filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 180) {
                $errors[] = ['row' => $rowNumber, 'email' => $email, 'message' => 'Email is not valid.'];
                continue;
            }
            if (isset($seenInFile[$email])) {
                $errors[] = ['row' => $rowNumber, 'email' => $email, 'message' => 'Duplicate email in this file.'];
                continue;
            }
            $seenInFile[$email] = true;

            if ($this->users->findOneByEmailInsensitive($email) instanceof User) {
                ++$skipped;
                continue;
            }

            $displayName = $cell('displayName');
            if ('' === $displayName) {
                $displayName = trim($cell('firstName').' '.$cell('lastName'));
            }
            if ('' === $displayName) {
                $local = explode('@', $email)[0];
                $displayName = '' !== $local ? $local : 'Imported user';
            }
            if (mb_strlen($displayName) > 255) {
                $errors[] = ['row' => $rowNumber, 'email' => $email, 'message' => 'Display name is too long.'];
                continue;
            }

            $rolesResult = $this->parseRoles($cell('roles'), $allowPlatformAdmins);
            $roles = $rolesResult['roles'];
            if (null !== $rolesResult['warning']) {
                $warnings[] = ['row' => $rowNumber, 'email' => $email, 'message' => $rolesResult['warning']];
            }

            $password = $cell('password');
            if ($this->isBlankPassword($password)) {
                $password = '';
            }
            $needsReset = '' === $password;
            if (!$needsReset && $this->looksLikePasswordHash($password)) {
                $needsReset = true;
                $password = '';
                $warnings[] = [
                    'row' => $rowNumber,
                    'email' => $email,
                    'message' => 'Password hash from another site cannot be reused. A reset link will be emailed (or they can use Forgot password).',
                ];
            }
            if (!$needsReset && mb_strlen($password) < self::MIN_PASSWORD_LENGTH) {
                $errors[] = ['row' => $rowNumber, 'email' => $email, 'message' => 'Password must be at least 8 characters.'];
                continue;
            }

            $verifiedRaw = $cell('emailVerified');
            $emailVerified = '' === $verifiedRaw ? true : $this->parseBool($verifiedRaw, true);

            $dobRaw = $cell('dateOfBirth');
            $dateOfBirth = null;
            if ('' !== $dobRaw) {
                try {
                    $dateOfBirth = AgeAttestation::parse($this->normalizeDob($dobRaw));
                } catch (\InvalidArgumentException $e) {
                    $errors[] = ['row' => $rowNumber, 'email' => $email, 'message' => $e->getMessage()];
                    continue;
                }
            } else {
                $warnings[] = [
                    'row' => $rowNumber,
                    'email' => $email,
                    'message' => 'No date of birth; age is not attested. Add a dateOfBirth column (YYYY-MM-DD) when you have it.',
                ];
            }

            if ($dryRun) {
                ++$created;
                if ($needsReset && $sendResetEmails) {
                    if ($resetEmailsSent < self::MAX_RESET_EMAILS) {
                        ++$resetEmailsSent;
                    } else {
                        ++$resetEmailsOmitted;
                    }
                }
                continue;
            }

            $user = new User();
            $user->setEmail($email);
            $user->setDisplayName($displayName);
            $user->setRoles($roles);
            $user->setEmailVerified($emailVerified);
            if ($dateOfBirth instanceof \DateTimeImmutable) {
                $user->setDateOfBirth($dateOfBirth);
            }
            // Blank / foreign-hash passwords get one shared disposable hash so we
            // do not burn ~200ms of bcrypt per row (that timed out ~100+ imports).
            if ($needsReset) {
                $user->setPassword($this->unusablePasswordHash($user));
            } else {
                $user->setPassword($this->passwordHasher->hashPassword($user, $password));
            }
            $this->entityManager->persist($user);
            ++$created;

            if (0 === $created % 50) {
                $this->entityManager->flush();
            }

            if ($needsReset && $sendResetEmails) {
                $pendingResets[] = ['user' => $user, 'row' => $rowNumber, 'email' => $email];
            }
        }

        if (!$dryRun && $created > 0) {
            $this->entityManager->flush();
        }

        foreach ($pendingResets as $pending) {
            if ($resetEmailsSent >= self::MAX_RESET_EMAILS) {
                ++$resetEmailsOmitted;
                continue;
            }

            try {
                // Import links stay valid until used — shoppers may take days to open mail.
                $token = $this->passwordReset->issueToken($pending['user'], null);
                $this->mail->sendPasswordReset($pending['user'], $token, $brandStore, untilUsed: true);
                ++$resetEmailsSent;
            } catch (\Throwable) {
                ++$resetEmailsOmitted;
                $warnings[] = [
                    'row' => $pending['row'],
                    'email' => $pending['email'],
                    'message' => 'Account was created, but the password-reset email could not be sent.',
                ];
            }
        }

        return [
            'created' => $created,
            'skipped' => $skipped,
            'resetEmailsSent' => $resetEmailsSent,
            'resetEmailsOmitted' => $resetEmailsOmitted,
            'dryRun' => $dryRun,
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    /**
     * @param list<string> $headers
     *
     * @return array<string, int>
     */
    private function headerIndex(array $headers): array
    {
        $index = [];
        foreach ($headers as $i => $header) {
            $canonical = $this->canonicalHeader((string) $header);
            if (null !== $canonical && !array_key_exists($canonical, $index)) {
                $index[$canonical] = $i;
            }
        }

        return $index;
    }

    private function canonicalHeader(string $header): ?string
    {
        $header = trim(preg_replace('/^\x{FEFF}/u', '', $header) ?? $header);
        $key = strtolower(preg_replace('/[\s_\-]+/', '', $header) ?? $header);

        return self::HEADER_ALIASES[$key] ?? null;
    }

    /**
     * @return array{roles: list<string>, warning: ?string}
     */
    private function parseRoles(string $raw, bool $allowPlatformAdmins): array
    {
        if ('' === $raw) {
            return ['roles' => ['ROLE_USER'], 'warning' => null];
        }

        $roles = [];
        $strippedPlatformAdmin = false;
        foreach (preg_split('/[|,]/', $raw) ?: [] as $piece) {
            $token = strtolower(trim(str_replace(['-', ' '], '_', $piece)));
            $token = preg_replace('/^role_/', '', $token) ?? $token;

            $role = match ($token) {
                'user', 'customer', 'shopper', '' => 'ROLE_USER',
                'store_owner', 'storeowner', 'owner' => 'ROLE_STORE_OWNER',
                'super_admin', 'superadmin', 'platform_admin', 'platformadmin' => 'ROLE_SUPER_ADMIN',
                default => null,
            };

            if ('ROLE_SUPER_ADMIN' === $role && !$allowPlatformAdmins) {
                $strippedPlatformAdmin = true;
                $role = 'ROLE_USER';
            }

            if (null !== $role) {
                $roles[] = $role;
            }
        }

        if ([] === $roles) {
            $roles = ['ROLE_USER'];
        }

        return [
            'roles' => array_values(array_unique($roles)),
            'warning' => $strippedPlatformAdmin
                ? 'Platform-admin role was ignored. Enable that option to import platform admins.'
                : null,
        ];
    }

    private function parseBool(string $raw, bool $default): bool
    {
        return match (strtolower(trim($raw))) {
            '1', 'true', 'yes', 'y', 'on' => true,
            '0', 'false', 'no', 'n', 'off' => false,
            default => $default,
        };
    }

    /** Excel "Unicode CSV" and UTF-8 BOM exports otherwise fail header matching. */
    private function decodeCsvBytes(string $csv): string
    {
        if (str_starts_with($csv, "\xEF\xBB\xBF")) {
            return substr($csv, 3);
        }
        if (str_starts_with($csv, "\xFF\xFE") || str_starts_with($csv, "\xFE\xFF")) {
            $converted = @mb_convert_encoding($csv, 'UTF-8', 'UTF-16');

            return \is_string($converted) ? $converted : $csv;
        }
        if (str_contains(substr($csv, 0, 80), "\x00")) {
            $converted = @mb_convert_encoding($csv, 'UTF-8', 'UTF-16LE');
            if (\is_string($converted) && !str_contains($converted, "\x00")) {
                return $converted;
            }
        }

        return $csv;
    }

    private function isBlankPassword(string $password): bool
    {
        return in_array(strtolower(trim($password)), ['', 'null', 'n/a', 'na', 'none', 'nil', '-'], true);
    }

    /**
     * Previous-site exports often put bcrypt/argon/hex hashes in the password
     * column. Those cannot be verified here, so the row must get a reset.
     */
    private function looksLikePasswordHash(string $password): bool
    {
        if (str_starts_with($password, '$2y$')
            || str_starts_with($password, '$2a$')
            || str_starts_with($password, '$2b$')
            || str_starts_with($password, '$argon2')
            || str_starts_with($password, '$pbkdf2')
            || str_starts_with($password, '$5$')
            || str_starts_with($password, '$6$')) {
            return true;
        }
        if (1 === preg_match('/^\{(?:SSHA|SHA|MD5)\}/i', $password)) {
            return true;
        }

        $length = strlen($password);

        return in_array($length, [32, 40, 64], true) && ctype_xdigit($password);
    }

    /**
     * Accepts YYYY-MM-DD plus the date shapes spreadsheet exports actually use.
     * Ambiguous numeric dates prefer month/day/year (US exports).
     */
    private function normalizeDob(string $raw): string
    {
        $raw = trim($raw);
        if (1 === preg_match('/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/', $raw, $match)) {
            return sprintf('%04d-%02d-%02d', (int) $match[1], (int) $match[2], (int) $match[3]);
        }
        if (1 === preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/', $raw, $match)) {
            $first = (int) $match[1];
            $second = (int) $match[2];
            $year = (int) $match[3];
            if ($first > 12) {
                return sprintf('%04d-%02d-%02d', $year, $second, $first);
            }

            return sprintf('%04d-%02d-%02d', $year, $first, $second);
        }
        if (1 === preg_match('/^\d{5,6}$/', $raw)) {
            $serial = (int) $raw;
            if ($serial >= 15000 && $serial <= 80000) {
                $unix = ($serial - 25569) * 86400;

                return (new \DateTimeImmutable('@'.$unix))
                    ->setTimezone(new \DateTimeZone('UTC'))
                    ->format('Y-m-d');
            }
        }

        return $raw;
    }

    /**
     * One expensive hash for every import row that will set a real password via
     * reset email. The shared value is never a login credential — issueToken
     * + Forgot password remain the only paths in.
     */
    private function unusablePasswordHash(User $prototype): string
    {
        if (null === $this->sharedUnusablePasswordHash) {
            $this->sharedUnusablePasswordHash = $this->passwordHasher->hashPassword(
                $prototype,
                bin2hex(random_bytes(32)),
            );
        }

        return $this->sharedUnusablePasswordHash;
    }
}
