<?php

namespace App\Tests\Controller;

use App\Entity\StoreStaff;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

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
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        $emails = array_column(array_column($payload, 'user'), 'email');
        self::assertContains($owner->getEmail(), $emails);
        self::assertContains('clerk@test.local', $emails);

        $clerk = $this->em->getRepository(User::class)->findOneBy(['email' => 'clerk@test.local']);
        self::assertInstanceOf(User::class, $clerk);

        $this->authenticate($clerk);
        $me = $this->jsonRequest('GET', '/api/me');
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame('staff-store', $me['managedStores'][0]['slug'] ?? null);

        $this->jsonRequest('GET', '/api/stores/staff-store/staff');
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
