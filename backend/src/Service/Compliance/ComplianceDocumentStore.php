<?php

namespace App\Service\Compliance;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/** Private on-disk store for seller permits and licenses. Not web-accessible. */
final class ComplianceDocumentStore
{
    public const MAX_BYTES = 8 * 1024 * 1024;

    private const MIME_EXTENSIONS = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    public function __construct(
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {
    }

    public function directory(): string
    {
        return $this->projectDir.'/var/share/compliance-docs';
    }

    public function store(UploadedFile $file): array
    {
        $mime = (string) $file->getMimeType();
        $extension = self::MIME_EXTENSIONS[$mime] ?? null;
        if (null === $extension) {
            throw new \InvalidArgumentException('Upload a PDF, JPEG, PNG, or WebP file.');
        }
        if ($file->getSize() > self::MAX_BYTES) {
            throw new \InvalidArgumentException('Documents can be at most 8 MB.');
        }

        $key = bin2hex(random_bytes(16)).'.'.$extension;
        $dir = $this->directory();
        if (!is_dir($dir) && !mkdir($dir, 0770, true) && !is_dir($dir)) {
            throw new \RuntimeException('Could not store the document.');
        }
        $file->move($dir, $key);

        return [
            'storageKey' => $key,
            'mime' => $mime,
            'originalFilename' => mb_substr($file->getClientOriginalName() ?: ('document.'.$extension), 0, 255),
        ];
    }

    public function path(string $storageKey): string
    {
        if (!preg_match('/^[a-f0-9]{32}\.(pdf|jpg|png|webp)$/', $storageKey)) {
            throw new \InvalidArgumentException('Invalid document.');
        }

        return $this->directory().'/'.$storageKey;
    }
}
