<?php

namespace App\Controller;

use App\Entity\User;
use App\Repository\StoreRepository;
use App\Repository\UserRepository;
use App\Service\User\UserCsvImporter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/users')]
#[IsGranted('ROLE_SUPER_ADMIN')]
final class AdminUserController extends AbstractController
{
    private const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

    /** @var list<string> */
    private const ALLOWED_MIME_TYPES = [
        'text/csv',
        'text/plain',
        'application/csv',
        'application/vnd.ms-excel',
        'application/octet-stream',
    ];

    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly StoreRepository $stores,
        private readonly UserRepository $users,
        private readonly UserCsvImporter $userImporter,
    ) {
    }

    /**
     * Import shoppers (and optional store owners) from a previous site CSV.
     * Existing emails are skipped; old password hashes cannot be reused.
     */
    #[Route('/import', name: 'api_admin_users_import', methods: ['POST'])]
    public function import(Request $request): JsonResponse
    {
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            return $this->json(['error' => 'A CSV file is required.'], Response::HTTP_BAD_REQUEST);
        }
        if (!$file->isValid()) {
            return $this->json(['error' => 'The uploaded file is invalid or incomplete.'], Response::HTTP_BAD_REQUEST);
        }

        $size = $file->getSize();
        if (null === $size || $size > self::MAX_UPLOAD_BYTES) {
            return $this->json(
                ['error' => sprintf('CSV exceeds the maximum allowed size of %d MB.', self::MAX_UPLOAD_BYTES >> 20)],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }
        if (!$this->looksLikeCsv($file)) {
            return $this->json(['error' => 'Only CSV files are accepted.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $result = $this->userImporter->import(
                $file->getContent(),
                $request->request->getBoolean('dryRun'),
                $request->request->getBoolean('sendResetEmails', true),
                $request->request->getBoolean('allowPlatformAdmins'),
            );
        } catch (\InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->json($result);
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

    private function looksLikeCsv(UploadedFile $file): bool
    {
        $extension = strtolower((string) $file->getClientOriginalExtension());
        if ('' !== $extension && 'csv' !== $extension && 'txt' !== $extension) {
            return false;
        }

        $mime = (string) $file->getClientMimeType();

        return '' === $mime || in_array(strtolower($mime), self::ALLOWED_MIME_TYPES, true);
    }
}
