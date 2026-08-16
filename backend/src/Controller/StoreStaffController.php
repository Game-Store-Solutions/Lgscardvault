<?php

namespace App\Controller;

use App\Entity\Store;
use App\Entity\StoreStaff;
use App\Entity\User;
use App\Repository\StoreRepository;
use App\Repository\StoreStaffRepository;
use App\Repository\UserRepository;
use App\Service\Mail\TransactionalMailer;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Store owners add employees and grant dashboard admin access. Staff with
 * admin may run the store; only the owner (or a platform admin) may change
 * who is on the team.
 */
#[Route('/api/stores/{slug}/staff')]
final class StoreStaffController extends AbstractController
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly StoreStaffRepository $staff,
        private readonly UserRepository $users,
        private readonly EntityManagerInterface $entityManager,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly TransactionalMailer $mail,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('', name: 'api_store_staff_list', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function list(string $slug): JsonResponse
    {
        $store = $this->requireStore($slug);
        if ($store instanceof JsonResponse) {
            return $store;
        }
        $this->denyAccessUnlessGranted('STORE_MANAGE', $store);

        return $this->json($this->serializeTeam($store));
    }

    #[Route('', name: 'api_store_staff_add', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function add(string $slug, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);
        if ($store instanceof JsonResponse) {
            return $store;
        }
        $this->denyAccessUnlessGranted('STORE_OWN', $store);

        $payload = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        if ('' === $email || false === filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->json(['detail' => 'Enter a valid email address.'], 422);
        }

        $role = $this->normalizeRole($payload['role'] ?? StoreStaff::ROLE_ADMIN);
        if (null === $role) {
            return $this->json(['detail' => 'Role must be admin or member.'], 422);
        }

        $user = $this->users->findOneBy(['email' => $email]);
        $created = false;
        if (!$user instanceof User) {
            $displayName = trim((string) ($payload['displayName'] ?? ''));
            if ('' === $displayName) {
                $displayName = explode('@', $email)[0];
            }
            $user = (new User())
                ->setEmail($email)
                ->setDisplayName(mb_substr($displayName, 0, 255))
                ->setRoles(['ROLE_USER']);
            $user->setPassword($this->passwordHasher->hashPassword($user, bin2hex(random_bytes(32))));
            $this->entityManager->persist($user);
            $created = true;
        }

        if ($store->isOwnedBy($user)) {
            return $this->json(['detail' => 'The store owner is already on this team.'], 422);
        }

        if ($this->staff->findOneFor($store, $user) instanceof StoreStaff) {
            return $this->json(['detail' => 'That person is already on this store.'], 422);
        }

        $member = (new StoreStaff())
            ->setStore($store)
            ->setUser($user)
            ->setRole($role);
        $this->entityManager->persist($member);
        $this->entityManager->flush();

        try {
            $this->mail->sendStaffInvite($store, $user, $created);
        } catch (\Throwable $e) {
            $this->logger->error('Staff invite email failed.', [
                'store' => $store->getId(),
                'user' => $user->getId(),
                'error' => $e->getMessage(),
            ]);
        }

        return $this->json($this->serializeTeam($store), 201);
    }

    #[Route('/{id}', name: 'api_store_staff_update', methods: ['PATCH'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function update(string $slug, int $id, Request $request): JsonResponse
    {
        $store = $this->requireStore($slug);
        if ($store instanceof JsonResponse) {
            return $store;
        }
        $this->denyAccessUnlessGranted('STORE_OWN', $store);

        $member = $this->staff->find($id);
        if (!$member instanceof StoreStaff || $member->getStore()?->getId() !== $store->getId()) {
            return $this->json(['detail' => 'Staff member not found.'], 404);
        }

        $payload = json_decode($request->getContent() ?: '[]', true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        if (array_key_exists('role', $payload)) {
            $role = $this->normalizeRole($payload['role']);
            if (null === $role) {
                return $this->json(['detail' => 'Role must be admin or member.'], 422);
            }
            $member->setRole($role);
            $this->entityManager->flush();
        }

        return $this->json($this->serializeTeam($store));
    }

    #[Route('/{id}', name: 'api_store_staff_remove', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function remove(string $slug, int $id): JsonResponse
    {
        $store = $this->requireStore($slug);
        if ($store instanceof JsonResponse) {
            return $store;
        }
        $this->denyAccessUnlessGranted('STORE_OWN', $store);

        $member = $this->staff->find($id);
        if (!$member instanceof StoreStaff || $member->getStore()?->getId() !== $store->getId()) {
            return $this->json(['detail' => 'Staff member not found.'], 404);
        }

        $this->entityManager->remove($member);
        $this->entityManager->flush();

        return $this->json($this->serializeTeam($store));
    }

    private function requireStore(string $slug): Store|JsonResponse
    {
        $store = $this->stores->findOneBySlug($slug);
        if (!$store instanceof Store) {
            return $this->json(['detail' => 'Store not found.'], 404);
        }

        return $store;
    }

    private function normalizeRole(mixed $role): ?string
    {
        $value = is_string($role) ? strtolower(trim($role)) : '';
        if (in_array($value, StoreStaff::ROLES, true)) {
            return $value;
        }

        return null;
    }

    /** @return list<array<string, mixed>> */
    private function serializeTeam(Store $store): array
    {
        $owner = $store->getOwner();
        $rows = [];
        if ($owner instanceof User) {
            $rows[] = [
                'id' => null,
                'role' => 'owner',
                'isOwner' => true,
                'user' => [
                    'id' => $owner->getId(),
                    'email' => $owner->getEmail(),
                    'displayName' => $owner->getDisplayName(),
                ],
            ];
        }

        foreach ($this->staff->findForStore($store) as $member) {
            $user = $member->getUser();
            if (!$user instanceof User) {
                continue;
            }
            $rows[] = [
                'id' => $member->getId(),
                'role' => $member->getRole(),
                'isOwner' => false,
                'user' => [
                    'id' => $user->getId(),
                    'email' => $user->getEmail(),
                    'displayName' => $user->getDisplayName(),
                ],
            ];
        }

        return $rows;
    }
}
