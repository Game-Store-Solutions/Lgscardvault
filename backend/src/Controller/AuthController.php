<?php

namespace App\Controller;

use App\Entity\User;
use App\Repository\UserRepository;
use App\Security\ApiRateLimit;
use App\Service\Auth\EmailVerificationService;
use App\Service\Auth\PasswordResetService;
use App\Service\Mail\TransactionalMailer;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/api')]
class AuthController extends AbstractController
{
    public function __construct(
        private readonly UserRepository $userRepository,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly ValidatorInterface $validator,
        private readonly TransactionalMailer $mail,
        private readonly LoggerInterface $logger,
        private readonly PasswordResetService $passwordReset,
        private readonly EmailVerificationService $emailVerification,
        private readonly JWTTokenManagerInterface $jwtManager,
        #[Autowire(service: 'limiter.forgot_password')]
        private readonly RateLimiterFactoryInterface $forgotPasswordLimiter,
        #[Autowire(service: 'limiter.reset_password')]
        private readonly RateLimiterFactoryInterface $resetPasswordLimiter,
        #[Autowire(service: 'limiter.email_verification')]
        private readonly RateLimiterFactoryInterface $emailVerificationLimiter,
    ) {
    }

    #[Route('/register', name: 'api_register', methods: ['POST'])]
    public function register(Request $request): JsonResponse
    {
        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];

        $email = isset($payload['email']) ? trim((string) $payload['email']) : '';
        $password = isset($payload['password']) ? (string) $payload['password'] : '';
        $displayName = isset($payload['displayName']) ? trim((string) $payload['displayName']) : '';
        $accountType = isset($payload['accountType']) ? trim((string) $payload['accountType']) : 'owner';
        $acceptedTerms = $this->isTruthy($payload['acceptedTerms'] ?? false);

        // Admin accounts must never be self-registered through this public endpoint.
        // The supported way to bootstrap a super-admin is the `app:create-admin` console command.
        if ('admin' === $accountType) {
            return $this->json(
                ['error' => 'Admin accounts cannot be self-registered.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        if (!$acceptedTerms) {
            return $this->json(
                ['error' => 'Please accept the Terms of Service and Privacy Policy.'],
                Response::HTTP_BAD_REQUEST,
            );
        }

        $dateOfBirth = $this->parseDateOfBirth($payload['dateOfBirth'] ?? null);
        if ($dateOfBirth instanceof JsonResponse) {
            return $dateOfBirth;
        }

        $violations = $this->validator->validate($email, [new Assert\NotBlank(), new Assert\Email()]);
        $violations->addAll($this->validator->validate($password, [new Assert\NotBlank(), new Assert\Length(min: 8)]));
        $violations->addAll($this->validator->validate($displayName, [new Assert\NotBlank()]));
        $violations->addAll($this->validator->validate($accountType, [new Assert\Choice(choices: ['owner', 'customer'])]));

        if (count($violations) > 0) {
            return $this->json(['error' => (string) $violations->get(0)->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        if ($this->userRepository->findOneBy(['email' => $email])) {
            return $this->json(['error' => 'Email already registered.'], Response::HTTP_CONFLICT);
        }

        $roles = ['ROLE_USER'];
        if ('owner' === $accountType) {
            // Owner self-signup is intentional: this is the public marketplace signup flow
            // for store owners. Only ROLE_STORE_OWNER (never ROLE_SUPER_ADMIN) is granted here.
            $roles[] = 'ROLE_STORE_OWNER';
        }

        $user = (new User())
            ->setEmail($email)
            ->setDisplayName($displayName)
            ->setRoles($roles)
            ->setEmailVerified(false)
            ->setDateOfBirth($dateOfBirth)
            ->setTermsAcceptedAt(new \DateTimeImmutable());

        $user->setPassword($this->passwordHasher->hashPassword($user, $password));

        $this->userRepository->save($user, true);

        try {
            $token = $this->emailVerification->issueToken($user);
            $this->mail->sendEmailVerification($user, $token);
        } catch (\Throwable $e) {
            $this->logger->error('Verification email failed.', [
                'user' => $user->getId(),
                'error' => $e->getMessage(),
            ]);
        }

        return $this->json([
            'id' => $user->getId(),
            'email' => $user->getEmail(),
            'displayName' => $user->getDisplayName(),
            'roles' => $user->getRoles(),
            'emailVerified' => false,
        ], Response::HTTP_CREATED);
    }

    /**
     * Always 200 for a well-formed email so callers cannot probe which
     * addresses have accounts. Mail is sent only when the user exists.
     */
    #[Route('/auth/forgot-password', name: 'api_forgot_password', methods: ['POST'])]
    public function forgotPassword(Request $request): JsonResponse
    {
        $ipBlocked = ApiRateLimit::enforce(
            $this->forgotPasswordLimiter,
            'ip:'.($request->getClientIp() ?? 'unknown'),
            'Too many reset requests. Please wait and try again.',
        );
        if ($ipBlocked instanceof JsonResponse) {
            return $ipBlocked;
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $email = isset($payload['email']) ? trim((string) $payload['email']) : '';

        $violations = $this->validator->validate($email, [new Assert\NotBlank(), new Assert\Email()]);
        if (count($violations) > 0) {
            return $this->json(['error' => 'Enter a valid email address.'], Response::HTTP_BAD_REQUEST);
        }

        $emailBlocked = ApiRateLimit::enforce(
            $this->forgotPasswordLimiter,
            'email:'.hash('sha256', strtolower($email)),
            'Too many reset requests. Please wait and try again.',
        );
        if ($emailBlocked instanceof JsonResponse) {
            return $emailBlocked;
        }

        $user = $this->userRepository->findOneByEmailInsensitive($email);
        if ($user instanceof User) {
            try {
                $token = $this->passwordReset->issueToken($user);
                $this->mail->sendPasswordReset($user, $token);
            } catch (\Throwable $e) {
                $this->logger->error('Password reset email failed.', [
                    'user' => $user->getId(),
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $this->json(['detail' => PasswordResetService::GENERIC_SENT]);
    }

    #[Route('/auth/reset-password', name: 'api_reset_password', methods: ['POST'])]
    public function resetPassword(Request $request): JsonResponse
    {
        $blocked = ApiRateLimit::enforce(
            $this->resetPasswordLimiter,
            'ip:'.($request->getClientIp() ?? 'unknown'),
            'Too many reset attempts. Please wait and try again.',
        );
        if ($blocked instanceof JsonResponse) {
            return $blocked;
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $token = isset($payload['token']) ? (string) $payload['token'] : '';
        $password = isset($payload['password']) ? (string) $payload['password'] : '';

        $error = $this->passwordReset->reset($token, $password);
        if (null !== $error) {
            $status = PasswordResetService::INVALID_LINK === $error
                ? Response::HTTP_BAD_REQUEST
                : Response::HTTP_UNPROCESSABLE_ENTITY;

            return $this->json(['error' => $error], $status);
        }

        return $this->json(['detail' => 'Password updated. You can sign in now.']);
    }

    /**
     * Always 200 for a well-formed email so callers cannot probe which
     * addresses still need verification.
     */
    #[Route('/auth/resend-verification', name: 'api_resend_verification', methods: ['POST'])]
    public function resendVerification(Request $request): JsonResponse
    {
        $ipBlocked = ApiRateLimit::enforce(
            $this->emailVerificationLimiter,
            'ip:'.($request->getClientIp() ?? 'unknown'),
            'Too many verification emails. Please wait and try again.',
        );
        if ($ipBlocked instanceof JsonResponse) {
            return $ipBlocked;
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $email = isset($payload['email']) ? trim((string) $payload['email']) : '';

        $violations = $this->validator->validate($email, [new Assert\NotBlank(), new Assert\Email()]);
        if (count($violations) > 0) {
            return $this->json(['error' => 'Enter a valid email address.'], Response::HTTP_BAD_REQUEST);
        }

        $emailBlocked = ApiRateLimit::enforce(
            $this->emailVerificationLimiter,
            'email:'.hash('sha256', strtolower($email)),
            'Too many verification emails. Please wait and try again.',
        );
        if ($emailBlocked instanceof JsonResponse) {
            return $emailBlocked;
        }

        $user = $this->userRepository->findOneByEmailInsensitive($email);
        if ($user instanceof User && !$user->isEmailVerified()) {
            try {
                $token = $this->emailVerification->issueToken($user);
                $this->mail->sendEmailVerification($user, $token);
            } catch (\Throwable $e) {
                $this->logger->error('Verification email failed.', [
                    'user' => $user->getId(),
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $this->json(['detail' => EmailVerificationService::GENERIC_SENT]);
    }

    #[Route('/auth/verify-email', name: 'api_verify_email', methods: ['POST'])]
    public function verifyEmail(Request $request): JsonResponse
    {
        $blocked = ApiRateLimit::enforce(
            $this->resetPasswordLimiter,
            'verify:'.($request->getClientIp() ?? 'unknown'),
            'Too many verification attempts. Please wait and try again.',
        );
        if ($blocked instanceof JsonResponse) {
            return $blocked;
        }

        /** @var array<string, mixed> $payload */
        $payload = json_decode($request->getContent(), true) ?? [];
        $token = isset($payload['token']) ? (string) $payload['token'] : '';

        $result = $this->emailVerification->consume($token);
        if (!$result instanceof User) {
            return $this->json(['error' => $result], Response::HTTP_BAD_REQUEST);
        }

        try {
            $this->mail->sendWelcome($result);
        } catch (\Throwable $e) {
            $this->logger->error('Welcome email failed after verification.', [
                'user' => $result->getId(),
                'error' => $e->getMessage(),
            ]);
        }

        return $this->json([
            'detail' => 'Email verified.',
            'token' => $this->jwtManager->create($result),
        ]);
    }

    private function isTruthy(mixed $value): bool
    {
        if (true === $value || 1 === $value || '1' === $value) {
            return true;
        }

        return is_string($value) && \in_array(strtolower($value), ['true', 'yes', 'on'], true);
    }

    private function parseDateOfBirth(mixed $raw): \DateTimeImmutable|JsonResponse
    {
        $dobRaw = trim((string) $raw);
        $dateOfBirth = \DateTimeImmutable::createFromFormat('!Y-m-d', $dobRaw) ?: null;
        if (!$dateOfBirth instanceof \DateTimeImmutable || $dateOfBirth->format('Y-m-d') !== $dobRaw) {
            return $this->json(
                ['error' => 'Enter your date of birth (YYYY-MM-DD).'],
                Response::HTTP_BAD_REQUEST,
            );
        }

        $age = User::ageYears($dateOfBirth);
        if ($age < 13) {
            return $this->json(
                ['error' => 'You must be at least 13 years old to create an account.'],
                Response::HTTP_BAD_REQUEST,
            );
        }
        if ($age > 120) {
            return $this->json(
                ['error' => 'Please enter a valid date of birth.'],
                Response::HTTP_BAD_REQUEST,
            );
        }

        return $dateOfBirth;
    }
}
