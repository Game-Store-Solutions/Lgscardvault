<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Self-service account management: profile updates, password changes, and
 * account deletion — all scoped strictly to the authenticated user.
 */
final class MeControllerTest extends WebTestCase
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

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

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

    private function setKnownPassword(User $user, string $password): void
    {
        $hasher = static::getContainer()->get(UserPasswordHasherInterface::class);
        $user->setPassword($hasher->hashPassword($user, $password));
        $this->em->flush();
    }

    public function testProfileUpdateAndAvatar(): void
    {
        $user = $this->fixtures->user(['ROLE_USER']);
        $this->authenticate($user);

        $body = $this->jsonRequest('PATCH', '/api/me', [
            'displayName' => 'New Name',
            'avatarUrl' => 'https://cdn.example/me.png',
        ]);
        self::assertResponseIsSuccessful();
        self::assertSame('New Name', $body['displayName']);
        self::assertSame('https://cdn.example/me.png', $body['avatarUrl']);

        // Clearing the avatar and rejecting junk URLs.
        $body = $this->jsonRequest('PATCH', '/api/me', ['avatarUrl' => '']);
        self::assertNull($body['avatarUrl']);
        $this->jsonRequest('PATCH', '/api/me', ['avatarUrl' => 'javascript:alert(1)']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
    }

    public function testPasswordChangeRequiresCurrentPassword(): void
    {
        $user = $this->fixtures->user(['ROLE_USER']);
        $this->setKnownPassword($user, 'old-password');
        $this->authenticate($user);

        $this->jsonRequest('POST', '/api/me/password', ['currentPassword' => 'wrong', 'newPassword' => 'brand-new-pass']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', '/api/me/password', ['currentPassword' => 'old-password', 'newPassword' => 'short']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', '/api/me/password', ['currentPassword' => 'old-password', 'newPassword' => 'brand-new-pass']);
        self::assertResponseIsSuccessful();
    }

    public function testDeleteAccountBlocksStoreOwnersAndDeletesCustomers(): void
    {
        // Store owners must divest first.
        $store = $this->fixtures->store();
        $owner = $store->getOwner();
        $this->setKnownPassword($owner, 'owner-pass');
        $this->authenticate($owner);
        $this->jsonRequest('DELETE', '/api/me', ['password' => 'owner-pass']);
        self::assertSame(409, $this->client->getResponse()->getStatusCode());

        // A plain customer deletes cleanly (wrong password rejected first).
        $customer = $this->fixtures->user(['ROLE_USER']);
        $this->setKnownPassword($customer, 'customer-pass');
        $customerId = $customer->getId();
        $this->authenticate($customer);

        $this->jsonRequest('DELETE', '/api/me', ['password' => 'nope']);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('DELETE', '/api/me', ['password' => 'customer-pass']);
        self::assertSame(204, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        self::assertNull($this->em->getRepository(User::class)->find($customerId));
    }
}
