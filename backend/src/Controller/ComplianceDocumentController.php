<?php

namespace App\Controller;

use App\Entity\ComplianceDocument;
use App\Entity\User;
use App\Service\Compliance\ComplianceDocumentStore;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api')]
final class ComplianceDocumentController extends AbstractController
{
    public function __construct(
        private readonly ComplianceDocumentStore $documents,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('/compliance-documents', name: 'api_compliance_document_upload', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function upload(Request $request): JsonResponse
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $kind = trim((string) $request->request->get('kind', ''));
        if (!in_array($kind, ComplianceDocument::KINDS, true)) {
            return $this->json(['detail' => 'Unknown document type.'], 422);
        }

        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            return $this->json(['detail' => 'Attach a file as the "file" form field.'], 400);
        }
        if (!$file->isValid()) {
            return $this->json(['detail' => 'Upload failed: '.$file->getErrorMessage()], 422);
        }

        try {
            $stored = $this->documents->store($file);
        } catch (\InvalidArgumentException $e) {
            return $this->json(['detail' => $e->getMessage()], 422);
        }

        $document = new ComplianceDocument(
            $user,
            $kind,
            $stored['storageKey'],
            $stored['originalFilename'],
            $stored['mime'],
        );
        $this->entityManager->persist($document);
        $this->entityManager->flush();

        return $this->json($document->toArray(), 201);
    }

    #[Route('/compliance-documents/{id}', name: 'api_compliance_document_download', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_USER')]
    public function download(int $id): BinaryFileResponse|JsonResponse
    {
        $user = $this->getUser();
        if (!$user instanceof User) {
            throw $this->createAccessDeniedException();
        }

        $document = $this->entityManager->find(ComplianceDocument::class, $id);
        if (!$document instanceof ComplianceDocument) {
            return $this->json(['detail' => 'Document not found.'], 404);
        }

        $isOwner = $document->getOwner()->getId() === $user->getId();
        $isAdmin = in_array('ROLE_SUPER_ADMIN', $user->getRoles(), true);
        if (!$isOwner && !$isAdmin) {
            throw $this->createAccessDeniedException();
        }

        $path = $this->documents->path($document->getStorageKey());
        if (!is_file($path)) {
            return $this->json(['detail' => 'Document is missing from storage.'], 404);
        }

        $response = new BinaryFileResponse($path);
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_INLINE, $document->getOriginalFilename());
        $response->headers->set('Content-Type', $document->getMime());

        return $response;
    }
}
