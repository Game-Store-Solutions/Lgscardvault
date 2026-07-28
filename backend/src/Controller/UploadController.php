<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Image uploads for avatars and store branding. Files land in
 * public/uploads under a random name (never the client's filename) and
 * are served statically; the returned path plugs straight into the
 * existing avatarUrl / logoUrl / heroImageUrl fields, whose validators
 * already accept site-relative "/..." paths.
 *
 * The type check trusts the file CONTENT (finfo), not the client's
 * claimed mime or extension, and only raster image formats are accepted —
 * no SVG, which can carry scripts.
 */
#[Route('/api')]
final class UploadController extends AbstractController
{
    private const MAX_BYTES = 4 * 1024 * 1024;

    /** Detected mime → extension the stored file gets. */
    private const MIME_EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    #[Route('/uploads', name: 'api_upload_image', methods: ['POST'])]
    #[IsGranted('ROLE_USER')]
    public function upload(
        Request $request,
        #[Autowire('%kernel.project_dir%')] string $projectDir,
    ): JsonResponse {
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            return $this->json(['detail' => 'Attach an image as the "file" form field.'], 400);
        }
        if (!$file->isValid()) {
            // Most commonly the file tripped php.ini's upload_max_filesize.
            return $this->json(['detail' => 'Upload failed: '.$file->getErrorMessage()], 422);
        }
        if ($file->getSize() > self::MAX_BYTES) {
            return $this->json(['detail' => 'Images can be at most 4 MB.'], 422);
        }

        $extension = self::MIME_EXTENSIONS[(string) $file->getMimeType()] ?? null;
        if (null === $extension) {
            return $this->json(['detail' => 'Only JPEG, PNG, WebP, or GIF images are allowed.'], 422);
        }

        $name = bin2hex(random_bytes(16)).'.'.$extension;
        $file->move($projectDir.'/public/uploads', $name);

        return $this->json(['url' => '/uploads/'.$name], 201);
    }
}
