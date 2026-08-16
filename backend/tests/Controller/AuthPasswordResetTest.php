<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Service\Auth\PasswordResetService;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\Test\MailerAssertionsTrait;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

final class AuthPasswordResetTest extends WebTestCase
{
    use MailerAssertionsTrait;

    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;

    protected function setUp(): void
    {
        self::bootKernel();
        /** @var CacheItemPoolInterface $pool */
        $pool = self::getContainer()->get('cache.rate_limiter');
        $pool->clear();
        self::ensureKernelShutdown();

        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    /** @param array<string, mixed> $body */
    private function jsonRequest(string $method, string $url, array $body = []): array
    {
        $this->client->request($method, $url, server: ['CONTENT_TYPE' => 'application/json'], content: json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    private function tokenFromLastEmail(): string
    {
        $message = $this->getMailerMessage();
        self::assertNotNull($message);
        $body = ($message->getTextBody() ?? '').($message->getHtmlBody() ?? '');
        self::assertMatchesRegularExpression('/reset-password\?token=([a-f0-9]{64})/', $body);
        preg_match('/reset-password\?token=([a-f0-9]{64})/', $body, $matches);

        return $matches[1];
    }

    private function uniqueEmail(string $prefix): string
    {
        return sprintf('%s-%s@test.local', $prefix, bin2hex(random_bytes(4)));
    }

    public function testUnknownEmailStillReturnsOkAndSendsNothing(): void
    {
        $payload = $this->jsonRequest('POST', '/api/auth/forgot-password', ['email' => 'nobody-reset@test.local']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame(PasswordResetService::GENERIC_SENT, $payload['detail'] ?? null);
        self::assertEmailCount(0);
    }

    public function testResetLinkLetsUserSignInWithNewPasswordOnce(): void
    {
        $email = $this->uniqueEmail('reset-ok');
        $user = $this->fixtures->user(['ROLE_USER'], $email);
        $hasher = static::getContainer()->get(UserPasswordHasherInterface::class);
        $user->setPassword($hasher->hashPassword($user, 'old-pass-1'));
        $this->em->flush();

        $this->jsonRequest('POST', '/api/auth/forgot-password', ['email' => strtoupper($email[0]).substr($email, 1)]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertEmailCount(1);
        $this->assertEmailSubjectContains($this->getMailerMessage(), 'Reset your LGS Card Vault password');

        $token = $this->tokenFromLastEmail();
        $reset = $this->jsonRequest('POST', '/api/auth/reset-password', [
            'token' => $token,
            'password' => 'new-pass-9',
        ]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), json_encode($reset));

        $this->jsonRequest('POST', '/api/login', [
            'email' => $email,
            'password' => 'new-pass-9',
        ]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', '/api/login', [
            'email' => $email,
            'password' => 'old-pass-1',
        ]);
        self::assertSame(401, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', '/api/auth/reset-password', [
            'token' => $token,
            'password' => 'another-pass-1',
        ]);
        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }

    public function testExpiredAndShortPasswordsAreRejected(): void
    {
        $email = $this->uniqueEmail('reset-expire');
        $this->fixtures->user(['ROLE_USER'], $email);
        $this->jsonRequest('POST', '/api/auth/forgot-password', ['email' => $email]);
        $token = $this->tokenFromLastEmail();

        $this->jsonRequest('POST', '/api/auth/reset-password', [
            'token' => $token,
            'password' => 'short',
        ]);
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        $stored = $this->em->getRepository(User::class)->findOneBy(['email' => $email]);
        self::assertInstanceOf(User::class, $stored);
        $stored->setPasswordResetExpiresAt(new \DateTimeImmutable('-1 minute'));
        $this->em->flush();

        $this->jsonRequest('POST', '/api/auth/reset-password', [
            'token' => $token,
            'password' => 'still-valid-1',
        ]);
        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }

    public function testInvalidEmailIsRejected(): void
    {
        $this->jsonRequest('POST', '/api/auth/forgot-password', ['email' => 'not-an-email']);
        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }
}
