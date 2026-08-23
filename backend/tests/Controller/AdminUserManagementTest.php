<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class AdminUserManagementTest extends WebTestCase
{
    private object $client;
    private EntityManagerInterface $entityManager;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->entityManager = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->entityManager);
    }

    /** @param array<string, mixed> $payload */
    private function authRequest(User $actor, string $method, string $url, array $payload = [], string $contentType = 'application/json'): void
    {
        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($actor);
        $this->client->request($method, $url, server: [
            'HTTP_AUTHORIZATION' => 'Bearer '.$token,
            'CONTENT_TYPE' => $contentType,
        ], content: (string) json_encode($payload));
    }

    public function testPlatformAdminCanEditUserIdentityAndAccess(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $target = $this->fixtures->user(['ROLE_USER']);
        $target->setEmailVerified(false);
        $this->entityManager->flush();
        $targetId = (int) $target->getId();

        $this->authRequest($admin, 'PATCH', '/api/admin/users/'.$targetId, [
            'displayName' => 'Updated Name',
            'email' => 'updated-user@test.local',
            'roles' => ['ROLE_USER', 'ROLE_STORE_OWNER'],
            'emailVerified' => true,
        ], 'application/merge-patch+json');

        self::assertResponseIsSuccessful();
        $this->entityManager->clear();
        $updated = $this->entityManager->getRepository(User::class)->find($targetId);
        self::assertSame('Updated Name', $updated->getDisplayName());
        self::assertSame('updated-user@test.local', $updated->getEmail());
        self::assertContains('ROLE_STORE_OWNER', $updated->getRoles());
        self::assertTrue($updated->isEmailVerified());
    }

    public function testNonAdminCannotEditOrDeleteUsers(): void
    {
        $actor = $this->fixtures->user(['ROLE_USER']);
        $target = $this->fixtures->user(['ROLE_USER']);

        $this->authRequest($actor, 'PATCH', '/api/admin/users/'.$target->getId(), [
            'displayName' => 'Forbidden',
        ], 'application/merge-patch+json');
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        $this->authRequest($actor, 'POST', '/api/admin/users/'.$target->getId().'/delete', [
            'confirmEmail' => $target->getEmail(),
        ]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    public function testAdminCannotDeleteOwnAccount(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);

        $this->authRequest($admin, 'POST', '/api/admin/users/'.$admin->getId().'/delete', [
            'confirmEmail' => $admin->getEmail(),
        ]);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertNotNull($this->entityManager->getRepository(User::class)->find($admin->getId()));
    }

    public function testOwnerMustTransferOrDeleteStoresFirst(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $store = $this->fixtures->store('owned-store');
        $owner = $store->getOwner();

        $this->authRequest($admin, 'POST', '/api/admin/users/'.$owner->getId().'/delete', [
            'confirmEmail' => $owner->getEmail(),
        ]);

        self::assertSame(409, $this->client->getResponse()->getStatusCode());
        self::assertNotNull($this->entityManager->getRepository(User::class)->find($owner->getId()));
    }

    public function testAdminCanDeleteUserWithExactEmailConfirmation(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $target = $this->fixtures->user(['ROLE_USER']);
        $targetId = (int) $target->getId();

        $this->authRequest($admin, 'POST', '/api/admin/users/'.$targetId.'/delete', [
            'confirmEmail' => $target->getEmail(),
        ]);

        self::assertSame(204, $this->client->getResponse()->getStatusCode());
        $this->entityManager->clear();
        self::assertNull($this->entityManager->getRepository(User::class)->find($targetId));
    }

    public function testCannotDemoteLastPlatformAdmin(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN'], 'primary-admin@test.local');
        $other = $this->fixtures->user(['ROLE_SUPER_ADMIN'], 'secondary-admin@test.local');

        // Demoting a peer is fine while another admin remains.
        $this->authRequest($admin, 'PATCH', '/api/admin/users/'.$other->getId(), [
            'roles' => ['ROLE_USER'],
        ], 'application/merge-patch+json');
        self::assertResponseIsSuccessful();

        $this->entityManager->clear();
        $admin = $this->entityManager->getRepository(User::class)->find($admin->getId());
        $other = $this->entityManager->getRepository(User::class)->find($other->getId());
        self::assertContains('ROLE_SUPER_ADMIN', $admin->getRoles());
        self::assertNotContains('ROLE_SUPER_ADMIN', $other->getRoles());

        // The remaining admin cannot strip their own platform role.
        $this->authRequest($admin, 'PATCH', '/api/admin/users/'.$admin->getId(), [
            'roles' => ['ROLE_USER'],
        ], 'application/merge-patch+json');
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->entityManager->clear();
        $admin = $this->entityManager->getRepository(User::class)->find($admin->getId());
        self::assertContains('ROLE_SUPER_ADMIN', $admin->getRoles());
    }

    public function testDuplicateEmailIsRejected(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $existing = $this->fixtures->user(['ROLE_USER'], 'taken@test.local');
        $target = $this->fixtures->user(['ROLE_USER'], 'free@test.local');

        $this->authRequest($admin, 'PATCH', '/api/admin/users/'.$target->getId(), [
            'email' => 'TAKEN@test.local',
        ], 'application/merge-patch+json');

        self::assertSame(409, $this->client->getResponse()->getStatusCode());
        $this->entityManager->clear();
        $reloaded = $this->entityManager->getRepository(User::class)->find($target->getId());
        self::assertSame('free@test.local', $reloaded->getEmail());
        self::assertSame('taken@test.local', $existing->getEmail());
    }

    public function testAdminCreateRequiresAdultDateOfBirth(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);

        $this->authRequest($admin, 'POST', '/api/admin/users', [
            'email' => 'new-shopper@test.local',
            'displayName' => 'New Shopper',
            'plainPassword' => 'Secret123!',
            'roles' => ['ROLE_USER'],
            'emailVerified' => true,
        ]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertNull($this->entityManager->getRepository(User::class)->findOneBy(['email' => 'new-shopper@test.local']));

        $this->authRequest($admin, 'POST', '/api/admin/users', [
            'email' => 'new-shopper@test.local',
            'displayName' => 'New Shopper',
            'plainPassword' => 'Secret123!',
            'roles' => ['ROLE_USER'],
            'emailVerified' => true,
            'dateOfBirth' => '1991-04-12',
        ]);
        self::assertResponseIsSuccessful();
        $this->entityManager->clear();
        $created = $this->entityManager->getRepository(User::class)->findOneBy(['email' => 'new-shopper@test.local']);
        self::assertNotNull($created);
        self::assertTrue($created->isAgeVerified());

        $payload = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertIsArray($payload);
        self::assertArrayNotHasKey('dateOfBirth', $payload);
        self::assertTrue($payload['ageVerified'] ?? false);
    }

    public function testAdminCanAttestAgeOnExistingUser(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $target = $this->fixtures->user(['ROLE_USER']);
        self::assertFalse($target->isAgeVerified());

        $this->authRequest($admin, 'PATCH', '/api/admin/users/'.$target->getId(), [
            'dateOfBirth' => '1988-06-01',
        ], 'application/merge-patch+json');
        self::assertResponseIsSuccessful();
        $this->entityManager->clear();
        $updated = $this->entityManager->getRepository(User::class)->find($target->getId());
        self::assertTrue($updated->isAgeVerified());
    }

    public function testAdminCreateRejectsUnder13(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $this->authRequest($admin, 'POST', '/api/admin/users', [
            'email' => 'kid@test.local',
            'displayName' => 'Kid',
            'plainPassword' => 'Secret123!',
            'roles' => ['ROLE_USER'],
            'dateOfBirth' => (new \DateTimeImmutable('today'))->modify('-10 years')->format('Y-m-d'),
        ]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertNull($this->entityManager->getRepository(User::class)->findOneBy(['email' => 'kid@test.local']));
    }
}
