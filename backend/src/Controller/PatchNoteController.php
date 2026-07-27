<?php

namespace App\Controller;

use App\Entity\PatchNote;
use App\Entity\User;
use App\Repository\PatchNoteRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Platform patch notes. Reading is restricted to admins (store owners and
 * platform admins) — this is the private "what changed" page, not a public
 * changelog. Writing lives under /api/admin, which the firewall already
 * limits to ROLE_SUPER_ADMIN.
 */
class PatchNoteController extends AbstractController
{
    public function __construct(
        private readonly PatchNoteRepository $patchNotes,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('/api/patch-notes', name: 'api_patch_notes_list', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function list(): JsonResponse
    {
        $user = $this->getUser();
        $roles = $user instanceof User ? $user->getRoles() : [];
        if (!in_array('ROLE_STORE_OWNER', $roles, true) && !in_array('ROLE_SUPER_ADMIN', $roles, true)) {
            return $this->json(['detail' => 'Patch notes are only visible to store admins.'], 403);
        }

        return $this->json(array_map($this->serialize(...), $this->patchNotes->findAllNewestFirst()));
    }

    #[Route('/api/admin/patch-notes', name: 'api_admin_patch_notes_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true);
        $error = $this->validate($payload);
        if (null !== $error) {
            return $this->json(['detail' => $error], 422);
        }

        $note = (new PatchNote())
            ->setTitle(mb_substr(trim((string) $payload['title']), 0, 160))
            ->setBody(trim((string) $payload['body']));

        $this->entityManager->persist($note);
        $this->entityManager->flush();

        return $this->json($this->serialize($note), 201);
    }

    #[Route('/api/admin/patch-notes/{id}', name: 'api_admin_patch_notes_update', methods: ['PATCH'])]
    public function update(Request $request, int $id): JsonResponse
    {
        $note = $this->patchNotes->find($id);
        if (!$note instanceof PatchNote) {
            return $this->json(['detail' => 'Patch note not found.'], 404);
        }

        $payload = json_decode($request->getContent(), true);
        if (!is_array($payload)) {
            return $this->json(['detail' => 'Request body must be a JSON object.'], 400);
        }

        if (array_key_exists('title', $payload)) {
            $title = trim((string) $payload['title']);
            if ('' === $title) {
                return $this->json(['detail' => 'Title cannot be empty.'], 422);
            }
            $note->setTitle(mb_substr($title, 0, 160));
        }
        if (array_key_exists('body', $payload)) {
            $body = trim((string) $payload['body']);
            if ('' === $body) {
                return $this->json(['detail' => 'Body cannot be empty.'], 422);
            }
            $note->setBody($body);
        }

        $note->touch();
        $this->entityManager->flush();

        return $this->json($this->serialize($note));
    }

    #[Route('/api/admin/patch-notes/{id}', name: 'api_admin_patch_notes_delete', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        $note = $this->patchNotes->find($id);
        if (!$note instanceof PatchNote) {
            return $this->json(['detail' => 'Patch note not found.'], 404);
        }

        $this->entityManager->remove($note);
        $this->entityManager->flush();

        return $this->json(null, 204);
    }

    private function validate(mixed $payload): ?string
    {
        if (!is_array($payload)) {
            return 'Request body must be a JSON object.';
        }
        if ('' === trim((string) ($payload['title'] ?? ''))) {
            return 'A title is required.';
        }
        if ('' === trim((string) ($payload['body'] ?? ''))) {
            return 'A body is required.';
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function serialize(PatchNote $note): array
    {
        return [
            'id' => $note->getId(),
            'title' => $note->getTitle(),
            'body' => $note->getBody(),
            'createdAt' => $note->getCreatedAt()->format(DATE_ATOM),
            'updatedAt' => $note->getUpdatedAt()?->format(DATE_ATOM),
        ];
    }
}
