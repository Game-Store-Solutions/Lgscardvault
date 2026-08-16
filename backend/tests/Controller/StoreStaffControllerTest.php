<?php

namespace App\Tests\Controller;

use App\Entity\StoreStaff;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

final class StoreStaffControllerTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function authenticate(?User $user): void
    {
        $this->bearer = null === $user
            ? null
            : static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    /** @param array<string, mixed>|null $body */
    private function jsonRequest(string $method, string $url, ?array $body = null): array
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }
        $this->client->request($method, $url, server: $server, content: null === $body ? '' : json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testOwnerCanAddEmployeeWithAdminAccess(): void
    {
        $store = $this->fixtures->store('staff-store');
        $owner = $store->getOwner();
        self::assertInstanceOf(User::class, $owner);
        $this->authenticate($owner);

        $payload = $this->jsonRequest('POST', '/api/stores/staff-store/staff', [
            'email' => 'clerk@test.local',
            'displayName' => 'Casey Clerk',
            'role' => 'admin',
            'password' => 'clerk-pass-1',
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        $emails = array_column(array_column($payload, 'user'), 'email');
        self::assertContains($owner->getEmail(), $emails);
        self::assertContains('clerk@test.local', $emails);

        $this->bearer = null;
        $this->jsonRequest('POST', '/api/login', [
            'email' => 'clerk@test.local',
            'password' => 'clerk-pass-1',
        ]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        $login = json_decode($this->client->getResponse()->getContent() ?: '[]', true);
        self::assertIsArray($login);
        self::assertArrayHasKey('token', $login);

        $this->bearer = (string) $login['token'];
        $me = $this->jsonRequest('GET', '/api/me');
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame('staff-store', $me['managedStores'][0]['slug'] ?? null);

        $this->jsonRequest('GET', '/api/stores/staff-store/staff');
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
    }

    public function testNewEmployeeRequiresPasswordExistingKeepsTheirs(): void
    {
        $store = $this->fixtures->store('staff-pw');
        $owner = $store->getOwner();
        self::assertInstanceOf(User::class, $owner);
        $this->authenticate($owner);

        $this->jsonRequest('POST', '/api/stores/staff-pw/staff', [
            'email' => 'needs-pass@test.local',
            'role' => 'admin',
        ]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $existing = $this->fixtures->user(['ROLE_USER'], 'already@test.local');
        $hasher = static::getContainer()->get(UserPasswordHasherInterface::class);
        $existing->setPassword($hasher->hashPassword($existing, 'keep-this-1'));
        $this->em->flush();

        $this->jsonRequest('POST', '/api/stores/staff-pw/staff', [
            'email' => 'already@test.local',
            'role' => 'admin',
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        $this->bearer = null;
        $this->jsonRequest('POST', '/api/login', [
            'email' => 'already@test.local',
            'password' => 'keep-this-1',
        ]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
    }

    public function testEmployeeCannotAddStaffAndStrangerCannotManage(): void
    {
        $store = $this->fixtures->store('staff-gate');
        $owner = $store->getOwner();
        self::assertInstanceOf(User::class, $owner);
        $clerk = $this->fixtures->user(['ROLE_USER'], 'gate-clerk@test.local');
        $member = (new StoreStaff())->setStore($store)->setUser($clerk)->setRole(StoreStaff::ROLE_ADMIN);
        $this->em->persist($member);
        $this->em->flush();

        $this->authenticate($clerk);
        $this->jsonRequest('POST', '/api/stores/staff-gate/staff', [
            'email' => 'another@test.local',
            'role' => 'admin',
        ]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        $stranger = $this->fixtures->user(['ROLE_USER'], 'stranger-staff@test.local');
        $this->authenticate($stranger);
        $this->jsonRequest('GET', '/api/stores/staff-gate/staff');
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    public function testOwnerCanRevokeAdminAndRemoveStaff(): void
    {
        $store = $this->fixtures->store('staff-revoke');
        $owner = $store->getOwner();
        self::assertInstanceOf(User::class, $owner);
        $clerk = $this->fixtures->user(['ROLE_USER'], 'revoke-clerk@test.local');
        $member = (new StoreStaff())->setStore($store)->setUser($clerk)->setRole(StoreStaff::ROLE_ADMIN);
        $this->em->persist($member);
        $this->em->flush();
        $id = (int) $member->getId();

        $this->authenticate($owner);
        $this->jsonRequest('PATCH', '/api/stores/staff-revoke/staff/'.$id, ['role' => 'member']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $this->authenticate($clerk);
        $this->jsonRequest('GET', '/api/stores/staff-revoke/staff');
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        $this->authenticate($owner);
        $this->jsonRequest('DELETE', '/api/stores/staff-revoke/staff/'.$id);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertNull($this->em->getRepository(StoreStaff::class)->find($id));
    }
}
