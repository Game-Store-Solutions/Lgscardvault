<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\MailerAssertionsTrait;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class AdminUserImportTest extends WebTestCase
{
    use MailerAssertionsTrait;

    private object $client;
    private EntityManagerInterface $entityManager;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->entityManager = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->entityManager);
    }

    public function testPlatformAdminCanImportUsersFromCsv(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $this->fixtures->user(['ROLE_USER'], 'already@test.local');

        $csv = <<<CSV
email,displayName,password,roles,emailVerified
fresh@test.local,Fresh Shopper,Secret123!,ROLE_USER,true
already@test.local,Skip Me,Secret123!,ROLE_USER,true
owner@test.local,Shop Owner,,ROLE_STORE_OWNER,true
not-an-email,Broken,,ROLE_USER,true
CSV;

        $payload = $this->importAs($admin, $csv, ['sendResetEmails' => '1']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        self::assertSame(2, $payload['created']);
        self::assertSame(1, $payload['skipped']);
        self::assertFalse($payload['dryRun']);
        self::assertSame(1, $payload['resetEmailsSent']);
        self::assertCount(1, $payload['errors']);
        self::assertSame('Email is not valid.', $payload['errors'][0]['message']);

        $this->entityManager->clear();
        $fresh = $this->entityManager->getRepository(User::class)->findOneBy(['email' => 'fresh@test.local']);
        $owner = $this->entityManager->getRepository(User::class)->findOneBy(['email' => 'owner@test.local']);
        self::assertNotNull($fresh);
        self::assertSame('Fresh Shopper', $fresh->getDisplayName());
        self::assertTrue($fresh->isEmailVerified());
        self::assertNotNull($owner);
        self::assertContains('ROLE_STORE_OWNER', $owner->getRoles());
        self::assertEmailCount(1);

        $this->client->request('POST', '/api/login', server: [
            'CONTENT_TYPE' => 'application/json',
        ], content: (string) json_encode([
            'email' => 'fresh@test.local',
            'password' => 'Secret123!',
        ]));
        self::assertResponseIsSuccessful();
    }

    public function testDryRunDoesNotPersistUsers(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $csv = "email,displayName\ndryrun@test.local,Dry Run\n";

        $payload = $this->importAs($admin, $csv, ['dryRun' => '1', 'sendResetEmails' => '0']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertTrue($payload['dryRun']);
        self::assertSame(1, $payload['created']);
        self::assertNull($this->entityManager->getRepository(User::class)->findOneBy(['email' => 'dryrun@test.local']));
        self::assertEmailCount(0);
    }

    public function testPlatformAdminRoleIsIgnoredUnlessEnabled(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $csv = "email,displayName,roles\nsneaky@test.local,Sneaky,ROLE_SUPER_ADMIN\n";

        $payload = $this->importAs($admin, $csv, ['sendResetEmails' => '0']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertNotEmpty($payload['warnings']);

        $this->entityManager->clear();
        $imported = $this->entityManager->getRepository(User::class)->findOneBy(['email' => 'sneaky@test.local']);
        self::assertNotNull($imported);
        self::assertNotContains('ROLE_SUPER_ADMIN', $imported->getRoles());

        $csv = "email,displayName,roles\nreal-admin@test.local,Real Admin,ROLE_SUPER_ADMIN\n";
        $payload = $this->importAs($admin, $csv, ['sendResetEmails' => '0', 'allowPlatformAdmins' => '1']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        $this->entityManager->clear();
        $realAdmin = $this->entityManager->getRepository(User::class)->findOneBy(['email' => 'real-admin@test.local']);
        self::assertNotNull($realAdmin);
        self::assertContains('ROLE_SUPER_ADMIN', $realAdmin->getRoles());
    }

    public function testNonAdminCannotImportUsers(): void
    {
        $actor = $this->fixtures->user(['ROLE_USER']);
        $this->importAs($actor, "email,displayName\nnope@test.local,Nope\n");
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
        self::assertNull($this->entityManager->getRepository(User::class)->findOneBy(['email' => 'nope@test.local']));
    }

    public function testMissingFileIsRejected(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($admin);
        $this->client->request('POST', '/api/admin/users/import', server: [
            'HTTP_AUTHORIZATION' => 'Bearer '.$token,
        ]);
        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }

    /**
     * @param array<string, string> $fields
     *
     * @return array<string, mixed>
     */
    private function importAs(User $actor, string $csv, array $fields = []): array
    {
        $path = tempnam(sys_get_temp_dir(), 'usrimp').'.csv';
        file_put_contents($path, $csv);
        $upload = new UploadedFile($path, 'users.csv', 'text/csv', test: true);
        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($actor);

        $this->client->request(
            'POST',
            '/api/admin/users/import',
            parameters: $fields,
            files: ['file' => $upload],
            server: ['HTTP_AUTHORIZATION' => 'Bearer '.$token],
        );

        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }
}
