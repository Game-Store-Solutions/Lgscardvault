<?php

namespace App\Tests\Controller;

use App\Tests\Support\CatalogFixtures;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Image uploads: authenticated users can store raster images (content-
 * sniffed, size-capped, random names); everything else is rejected.
 */
final class UploadControllerTest extends WebTestCase
{
    private object $client;

    /** @var list<string> uploaded files to remove after the test */
    private array $cleanup = [];

    protected function setUp(): void
    {
        $this->client = static::createClient();
    }

    protected function tearDown(): void
    {
        foreach ($this->cleanup as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    private function tempPng(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'upl').'.png';
        $image = imagecreatetruecolor(4, 4);
        imagepng($image, $path);

        return $path;
    }

    public function testUploadStoresPngAndRejectsNonImages(): void
    {
        $fixtures = new CatalogFixtures(static::getContainer()->get('doctrine')->getManager());
        $user = $fixtures->user(['ROLE_USER']);
        $bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
        $server = ['HTTP_AUTHORIZATION' => 'Bearer '.$bearer];

        // A real PNG is accepted and lands under public/uploads with a random name.
        $upload = new UploadedFile($this->tempPng(), 'my avatar.png', 'image/png', test: true);
        $this->client->request('POST', '/api/uploads', files: ['file' => $upload], server: $server);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        $url = json_decode((string) $this->client->getResponse()->getContent(), true)['url'] ?? '';
        self::assertMatchesRegularExpression('#^/uploads/[0-9a-f]{32}\.png$#', $url, 'random name, extension from detected mime');

        $stored = static::getContainer()->getParameter('kernel.project_dir').'/public'.$url;
        $this->cleanup[] = $stored;
        self::assertFileExists($stored);

        // A text file dressed up as an image is rejected on its content.
        $textPath = tempnam(sys_get_temp_dir(), 'upl').'.png';
        file_put_contents($textPath, 'not an image at all');
        $fake = new UploadedFile($textPath, 'sneaky.png', 'image/png', test: true);
        $this->client->request('POST', '/api/uploads', files: ['file' => $fake], server: $server);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        // No file field at all.
        $this->client->request('POST', '/api/uploads', server: $server);
        self::assertSame(400, $this->client->getResponse()->getStatusCode());

        // Anonymous requests never write anything.
        $this->client->request('POST', '/api/uploads', files: ['file' => new UploadedFile($this->tempPng(), 'a.png', 'image/png', test: true)]);
        self::assertSame(401, $this->client->getResponse()->getStatusCode());
    }
}
