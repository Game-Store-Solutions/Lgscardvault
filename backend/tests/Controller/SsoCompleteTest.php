<?php

namespace App\Tests\Controller;

use App\Service\Payments\SignedOAuthState;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class SsoCompleteTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;

    protected function setUp(): void
    {
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

    public function testCompleteIssuesJwtAfterDateOfBirth(): void
    {
        $user = $this->fixtures->user(['ROLE_USER']);
        self::assertFalse($user->isAgeVerified());

        $ticket = static::getContainer()->get(SignedOAuthState::class)->create('sso-age', '', (int) $user->getId(), 1800);
        $body = $this->jsonRequest('POST', '/api/auth/sso/complete', [
            'ticket' => $ticket,
            'dateOfBirth' => '1991-04-12',
            'acceptedTerms' => true,
        ]);

        self::assertSame(200, $this->client->getResponse()->getStatusCode(), json_encode($body));
        self::assertArrayHasKey('token', $body);

        $this->em->clear();
        $reloaded = $this->em->getRepository(\App\Entity\User::class)->find($user->getId());
        self::assertTrue($reloaded->isAgeVerified());
        self::assertNotNull($reloaded->getTermsAcceptedAt());
    }

    public function testCompleteRejectsUnder13(): void
    {
        $user = $this->fixtures->user(['ROLE_USER']);
        $ticket = static::getContainer()->get(SignedOAuthState::class)->create('sso-age', '', (int) $user->getId(), 1800);
        $body = $this->jsonRequest('POST', '/api/auth/sso/complete', [
            'ticket' => $ticket,
            'dateOfBirth' => (new \DateTimeImmutable('today'))->modify('-10 years')->format('Y-m-d'),
            'acceptedTerms' => true,
        ]);

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('13', (string) ($body['error'] ?? ''));
        self::assertArrayNotHasKey('token', $body);
    }

    public function testCompleteRejectsOidcStateAsTicket(): void
    {
        $ticket = static::getContainer()->get(SignedOAuthState::class)->create('oidc', '', 0, 1800);
        $body = $this->jsonRequest('POST', '/api/auth/sso/complete', [
            'ticket' => $ticket,
            'dateOfBirth' => '1991-04-12',
            'acceptedTerms' => true,
        ]);

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
        self::assertArrayNotHasKey('token', $body);
    }
}
