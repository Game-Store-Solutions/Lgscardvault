<?php

namespace App\Controller;

use App\Entity\User;
use App\Repository\StoreRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * The signed-in user's own account: profile read/update, password change,
 * and account deletion. Everything here operates strictly on getUser() —
 * no ids are accepted, so one account can never touch another.
 */
#[Route('/api')]
class MeController extends AbstractController
{
    private const URL_PATTERN = '#^(https?://|/)#';
    private const MIN_PASSWORD_LENGTH = 8;

    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly StoreRepository $storeRepository,
    ) {
    }

    #[Route('/me', name: 'api_me', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function me(): JsonResponse
    {
        return $this->json($this->serializeMe($this->requireUser()));
    }

    /** Update own profile: display name and avatar URL. */
    #[Route('/me', name: 'api_me_update', methods: ['PATCH'])]
    #[IsGranted('ROLE_USER')]
    public function update(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        if (array_key_exists('displayName', $payload)) {
            $name = trim((string) $payload['displayName']);
            if ('' === $name) {
                return $this->json(['detail' => 'Display name cannot be empty.'], 422);
            }
            $user->setDisplayName(mb_substr($name, 0, 255));
        }

        if (array_key_exists('avatarUrl', $payload)) {
            $url = trim((string) ($payload['avatarUrl'] ?? ''));
            if ('' === $url) {
                $user->setAvatarUrl(null);
            } elseif (1 === preg_match(self::URL_PATTERN, $url)) {
                $user->setAvatarUrl(mb_substr($url, 0, 1024));
            } else {
                return $this->json(['detail' => 'avatarUrl must be an http(s) URL or a path starting with "/".'], 422);
            }
        }

        $this->entityManager->flush();

        return $this->json($this->serializeMe($user));
    }

    /**
     * Stores where this customer has any activity — a saved profile, cart,
     * favorites, want list, orders, or sell submissions — newest first.
     * Powers the global account page's "your stores" list.
     */
    #[Route('/me/stores', name: 'api_me_stores', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function myStores(): JsonResponse
    {
        $user = $this->requireUser();
        $rows = $this->entityManager->getConnection()->fetchAllAssociative(
            <<<'SQL'
            SELECT s.id, s.name, s.slug, s.logo_url,
                   COALESCE(o.order_count, 0) AS order_count,
                   COALESCE(sub.submission_count, 0) AS submission_count,
                   GREATEST(
                       COALESCE(o.last_at, 'epoch'::timestamp),
                       COALESCE(sub.last_at, 'epoch'::timestamp),
                       COALESCE(act.last_at, 'epoch'::timestamp)
                   ) AS last_activity_at
            FROM stores s
            LEFT JOIN (
                SELECT store_id, COUNT(*) AS order_count, MAX(created_at) AS last_at
                FROM orders WHERE customer_email = :email GROUP BY store_id
            ) o ON o.store_id = s.id
            LEFT JOIN (
                SELECT store_id, COUNT(*) AS submission_count, MAX(created_at) AS last_at
                FROM sell_submissions WHERE user_id = :userId GROUP BY store_id
            ) sub ON sub.store_id = s.id
            LEFT JOIN (
                -- Carts, favorites, and want lists all hang off this row.
                SELECT store_id, MAX(created_at) AS last_at
                FROM store_customers WHERE user_id = :userId GROUP BY store_id
            ) act ON act.store_id = s.id
            WHERE o.store_id IS NOT NULL OR sub.store_id IS NOT NULL OR act.store_id IS NOT NULL
            ORDER BY last_activity_at DESC
            SQL,
            ['email' => $user->getEmail(), 'userId' => $user->getId()],
        );

        return $this->json(array_map(static fn (array $row) => [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'slug' => $row['slug'],
            'logoUrl' => $row['logo_url'],
            'orderCount' => (int) $row['order_count'],
            'submissionCount' => (int) $row['submission_count'],
            'lastActivityAt' => (new \DateTimeImmutable((string) $row['last_activity_at']))->format(DATE_ATOM),
        ], $rows));
    }

    /** Change own password; requires the current password. */
    #[Route('/me/password', name: 'api_me_password', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function changePassword(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $payload = json_decode($request->getContent(), true);
        $current = is_array($payload) ? (string) ($payload['currentPassword'] ?? '') : '';
        $new = is_array($payload) ? (string) ($payload['newPassword'] ?? '') : '';

        if (!$this->passwordHasher->isPasswordValid($user, $current)) {
            return $this->json(['detail' => 'Current password is incorrect.'], 422);
        }
        if (mb_strlen($new) < self::MIN_PASSWORD_LENGTH) {
            return $this->json(['detail' => sprintf('New password must be at least %d characters.', self::MIN_PASSWORD_LENGTH)], 422);
        }

        $user->setPassword($this->passwordHasher->hashPassword($user, $new));
        $this->entityManager->flush();

        return $this->json(['detail' => 'Password updated.']);
    }

    /**
     * Delete own account (password-confirmed). Store owners must transfer or
     * delete their stores first — a storefront silently vanishing with its
     * inventory, orders, and customers is not a one-click decision.
     * Customer-side rows (carts, favorites, want lists, notifications)
     * cascade away at the database level.
     */
    #[Route('/me', name: 'api_me_delete', methods: ['DELETE'])]
    #[IsGranted('ROLE_USER')]
    public function deleteAccount(Request $request): JsonResponse
    {
        $user = $this->requireUser();
        $payload = json_decode($request->getContent(), true);
        $password = is_array($payload) ? (string) ($payload['password'] ?? '') : '';

        if (!$this->passwordHasher->isPasswordValid($user, $password)) {
            return $this->json(['detail' => 'Password is incorrect.'], 422);
        }

        // Count in the database rather than trusting the lazy collection — a
        // freshly-persisted entity's inverse side can be stale in-memory.
        if ($this->storeRepository->count(['owner' => $user]) > 0) {
            return $this->json([
                'detail' => 'You still own a store. Transfer or delete your stores before deleting your account.',
            ], 409);
        }

        $this->entityManager->remove($user);
        $this->entityManager->flush();

        return $this->json(null, 204);
    }

    private function requireUser(): User
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        return $user;
    }

    /** @return array<string, mixed> */
    private function serializeMe(User $user): array
    {
        $ownedStores = [];
        foreach ($user->getOwnedStores() as $store) {
            $ownedStores[] = [
                'id' => $store->getId(),
                'name' => $store->getName(),
                'slug' => $store->getSlug(),
            ];
        }

        return [
            'id' => $user->getId(),
            'email' => $user->getEmail(),
            'displayName' => $user->getDisplayName(),
            'avatarUrl' => $user->getAvatarUrl(),
            'roles' => $user->getRoles(),
            'ownedStores' => $ownedStores,
        ];
    }
}
