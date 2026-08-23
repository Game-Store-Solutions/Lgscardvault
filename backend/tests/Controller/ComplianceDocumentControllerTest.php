<?php

namespace App\Tests\Controller;

use App\Entity\ComplianceDocument;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class ComplianceDocumentControllerTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    public function testOwnerCanUploadAndDownloadDocument(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($owner);
        $file = $this->pngUpload('seller-permit.png');

        $this->client->request(
            'POST',
            '/api/compliance-documents',
            ['kind' => ComplianceDocument::KIND_SELLER_PERMIT],
            ['file' => $file],
            ['HTTP_AUTHORIZATION' => 'Bearer '.$token],
        );
        self::assertSame(201, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        $created = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertIsArray($created);
        self::assertSame('seller_permit', $created['kind'] ?? null);
        self::assertSame('seller-permit.png', $created['originalFilename'] ?? null);
        self::assertSame('image/png', $created['mime'] ?? null);
        self::assertArrayNotHasKey('storageKey', $created);

        $id = (int) ($created['id'] ?? 0);
        self::assertGreaterThan(0, $id);

        $this->client->request('GET', '/api/compliance-documents/'.$id, server: [
            'HTTP_AUTHORIZATION' => 'Bearer '.$token,
        ]);
        self::assertResponseIsSuccessful();
        $response = $this->client->getResponse();
        self::assertInstanceOf(BinaryFileResponse::class, $response);
        self::assertSame('image/png', $response->headers->get('Content-Type'));
        self::assertStringContainsString('inline', (string) $response->headers->get('Content-Disposition'));
        self::assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
        self::assertFileExists($response->getFile()->getPathname());
        self::assertGreaterThan(0, $response->getFile()->getSize());
    }

    public function testOtherUserCannotDownloadDocument(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $stranger = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $ownerToken = static::getContainer()->get(JWTTokenManagerInterface::class)->create($owner);
        $strangerToken = static::getContainer()->get(JWTTokenManagerInterface::class)->create($stranger);

        $this->client->request(
            'POST',
            '/api/compliance-documents',
            ['kind' => ComplianceDocument::KIND_CITY_LICENSE],
            ['file' => $this->pngUpload('city.png')],
            ['HTTP_AUTHORIZATION' => 'Bearer '.$ownerToken],
        );
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        $id = (int) (json_decode((string) $this->client->getResponse()->getContent(), true)['id'] ?? 0);

        $this->client->request('GET', '/api/compliance-documents/'.$id, server: [
            'HTTP_AUTHORIZATION' => 'Bearer '.$strangerToken,
        ]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    public function testSuperAdminCanDownloadOwnerDocument(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $ownerToken = static::getContainer()->get(JWTTokenManagerInterface::class)->create($owner);
        $adminToken = static::getContainer()->get(JWTTokenManagerInterface::class)->create($admin);

        $this->client->request(
            'POST',
            '/api/compliance-documents',
            ['kind' => ComplianceDocument::KIND_SECONDHAND],
            ['file' => $this->pngUpload('secondhand.png')],
            ['HTTP_AUTHORIZATION' => 'Bearer '.$ownerToken],
        );
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        $id = (int) (json_decode((string) $this->client->getResponse()->getContent(), true)['id'] ?? 0);

        $this->client->request('GET', '/api/compliance-documents/'.$id, server: [
            'HTTP_AUTHORIZATION' => 'Bearer '.$adminToken,
        ]);
        self::assertResponseIsSuccessful();
        self::assertSame('image/png', $this->client->getResponse()->headers->get('Content-Type'));
    }

    private function pngUpload(string $filename): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'lgscv-doc');
        self::assertNotFalse($path);
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', true);
        self::assertNotFalse($png);
        file_put_contents($path, $png);

        return new UploadedFile($path, $filename, 'image/png', test: true);
    }
}
