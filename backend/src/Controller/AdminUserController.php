<?php

namespace App\Controller;

use App\Entity\User;
use App\Repository\StoreRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/users')]
#[IsGranted('ROLE_SUPER_ADMIN')]
final class AdminUserController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly StoreRepository $stores,
        private readonly UserRepository $users,
    ) {
    }

    /**
     * Explicit confirmation and ownership checks keep this destructive action
     * safe while related customer data is removed by database cascades.
     */
    #[Route('/{id}/delete', name: 'api_admin_user_delete', methods: ['POST'])]
    public function delete(User $user, Request $request): JsonResponse
    {
        $currentUser = $this->getUser();
        if ($currentUser instanceof User && $currentUser->getId() === $user->getId()) {
            return $this->json(['error' => 'You cannot delete your own account.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload) || !isset($payload['confirmEmail'])
            || 0 !== strcasecmp(trim((string) $payload['confirmEmail']), (string) $user->getEmail())) {
            return $this->json(['error' => 'Enter the user email exactly to confirm deletion.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if ($this->stores->count(['owner' => $user]) > 0) {
            return $this->json([
                'error' => 'Transfer or delete this user’s stores before deleting their account.',
            ], Response::HTTP_CONFLICT);
        }

        if (in_array('ROLE_SUPER_ADMIN', $user->getRoles(), true)
            && $this->users->countSuperAdmins((int) $user->getId()) < 1) {
            return $this->json([
                'error' => 'Cannot delete the last platform admin.',
            ], Response::HTTP_CONFLICT);
        }

        $this->entityManager->remove($user);
        $this->entityManager->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}
