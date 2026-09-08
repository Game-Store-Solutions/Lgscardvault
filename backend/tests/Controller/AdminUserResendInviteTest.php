<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\MailerAssertionsTrait;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class AdminUserResendInviteTest extends WebTestCase
{
    use MailerAssertionsTrait;

    private object $client;
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    public function testResendInviteSendsPasswordResetForVerifiedUser(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $target = $this->fixtures->user(['ROLE_USER'], 'invite-me@test.local');
        $target->markEmailVerified();
        $this->em->flush();

        $this->authenticate($admin);
        $this->client->request(
            'POST',
            '/api/admin/users/'.$target->getId().'/resend-invite',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: '{}',
        );

        self::assertResponseIsSuccessful();
        $payload = json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertTrue($payload['sent']);
        self::assertSame('password_reset', $payload['kind']);
        self::assertEmailCount(1);

        $this->em->refresh($target);
        self::assertNotNull($target->getPasswordResetToken());
        self::assertNull($target->getPasswordResetExpiresAt());
    }

    public function testResendInviteSendsVerificationWhenUnverified(): void
    {
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $target = $this->fixtures->user(['ROLE_USER'], 'need-verify@test.local');
        $target->setEmailVerified(false);
        $this->em->flush();

        $this->authenticate($admin);
        $this->client->request(
            'POST',
            '/api/admin/users/'.$target->getId().'/resend-invite',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: '{}',
        );

        self::assertResponseIsSuccessful();
        $payload = json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('verification', $payload['kind']);
        self::assertEmailCount(1);
    }

    public function testResendInviteRequiresSuperAdmin(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $target = $this->fixtures->user(['ROLE_USER'], 'nope@test.local');

        $this->authenticate($owner);
        $this->client->request(
            'POST',
            '/api/admin/users/'.$target->getId().'/resend-invite',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: '{}',
        );

        self::assertSame(403, $this->client->getResponse()->getStatusCode());
        self::assertEmailCount(0);
    }

    private function authenticate(User $user): void
    {
        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
        $this->client->setServerParameter('HTTP_AUTHORIZATION', 'Bearer '.$token);
    }
}
