<?php

namespace App\Controller;

use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\Mail\TransactionalMailer;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
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

        // Admin accounts must never be self-registered through this public endpoint.
        // The supported way to bootstrap a super-admin is the `app:create-admin` console command.
        if ('admin' === $accountType) {
            return $this->json(
                ['error' => 'Admin accounts cannot be self-registered.'],
                Response::HTTP_FORBIDDEN,
            );
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
            ->setRoles($roles);

        $user->setPassword($this->passwordHasher->hashPassword($user, $password));

        $this->userRepository->save($user, true);

        try {
            $this->mail->sendWelcome($user);
        } catch (\Throwable $e) {
            $this->logger->error('Welcome email failed.', ['user' => $user->getId(), 'error' => $e->getMessage()]);
        }

        return $this->json([
            'id' => $user->getId(),
            'email' => $user->getEmail(),
            'displayName' => $user->getDisplayName(),
            'roles' => $user->getRoles(),
        ], Response::HTTP_CREATED);
    }
}
