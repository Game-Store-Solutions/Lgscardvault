<?php

namespace App\Tests\Controller;

use App\Service\Auth\EmailVerificationService;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\Test\MailerAssertionsTrait;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

final class AuthEmailVerificationTest extends WebTestCase
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
        self::assertMatchesRegularExpression('/verify-email\?token=([a-f0-9]{64})/', $body);
        preg_match('/verify-email\?token=([a-f0-9]{64})/', $body, $matches);

        return $matches[1];
    }

    private function uniqueEmail(string $prefix): string
    {
        return sprintf('%s-%s@test.local', $prefix, bin2hex(random_bytes(4)));
    }

    public function testRegisterBlocksLoginUntilEmailIsVerified(): void
    {
        $email = $this->uniqueEmail('verify-new');
        $created = $this->jsonRequest('POST', '/api/register', [
            'email' => $email,
            'password' => 'verify-pass-1',
            'displayName' => 'New Shopper',
            'accountType' => 'customer',
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode(), json_encode($created));
        self::assertFalse($created['emailVerified'] ?? true);
        self::assertEmailCount(1);
        $token = $this->tokenFromLastEmail();

        $this->jsonRequest('POST', '/api/login', [
            'email' => $email,
            'password' => 'verify-pass-1',
        ]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        $verified = $this->jsonRequest('POST', '/api/auth/verify-email', ['token' => $token]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), json_encode($verified));
        self::assertArrayHasKey('token', $verified);

        $this->jsonRequest('POST', '/api/login', [
            'email' => $email,
            'password' => 'verify-pass-1',
        ]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', '/api/auth/verify-email', ['token' => $token]);
        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }

    public function testWrongPasswordStays401WhenUnverified(): void
    {
        $email = $this->uniqueEmail('verify-wrong');
        $this->jsonRequest('POST', '/api/register', [
            'email' => $email,
            'password' => 'verify-pass-1',
            'displayName' => 'Wrong Pass',
            'accountType' => 'customer',
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        $this->jsonRequest('POST', '/api/login', [
            'email' => $email,
            'password' => 'not-the-password',
        ]);
        self::assertSame(401, $this->client->getResponse()->getStatusCode());
    }

    public function testResendIsGenericAndExistingUsersStayVerified(): void
    {
        $payload = $this->jsonRequest('POST', '/api/auth/resend-verification', ['email' => 'nobody-verify@test.local']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame(EmailVerificationService::GENERIC_SENT, $payload['detail'] ?? null);
        self::assertEmailCount(0);

        $user = $this->fixtures->user(['ROLE_USER'], $this->uniqueEmail('already-verified'));
        $hasher = static::getContainer()->get(UserPasswordHasherInterface::class);
        $user->setPassword($hasher->hashPassword($user, 'keep-pass-1'));
        $this->em->flush();

        $this->jsonRequest('POST', '/api/login', [
            'email' => $user->getEmail(),
            'password' => 'keep-pass-1',
        ]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
    }

    public function testOwnerSignupAlsoRequiresVerification(): void
    {
        $email = $this->uniqueEmail('verify-owner');
        $created = $this->jsonRequest('POST', '/api/register', [
            'email' => $email,
            'password' => 'owner-pass-1',
            'displayName' => 'Store Owner',
            'accountType' => 'owner',
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode(), json_encode($created));
        self::assertFalse($created['emailVerified'] ?? true);
        self::assertEmailCount(1);
        $this->assertEmailSubjectContains($this->getMailerMessage(), 'Confirm your LGS Card Vault email');
        $token = $this->tokenFromLastEmail();

        $this->jsonRequest('POST', '/api/login', [
            'email' => $email,
            'password' => 'owner-pass-1',
        ]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        $verified = $this->jsonRequest('POST', '/api/auth/verify-email', ['token' => $token]);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), json_encode($verified));
        self::assertArrayHasKey('token', $verified);
    }
}
