<?php

namespace App\Tests\Controller;

use App\Entity\PrivacyRequest;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class PrivacyRequestTest extends WebTestCase
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
    private function jsonRequest(string $method, string $url, array $body = [], ?User $user = null, array $headers = []): array
    {
        $server = array_merge(['CONTENT_TYPE' => 'application/json'], $headers);
        if ($user instanceof User) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
        }
        $this->client->request($method, $url, server: $server, content: json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testPublicSubmitCreatesDoNotSellRequest(): void
    {
        $body = $this->jsonRequest('POST', '/api/privacy/requests', [
            'type' => 'do_not_sell',
            'name' => 'Ada Shopper',
            'email' => 'ada@example.com',
            'californiaResident' => true,
            'details' => 'Please do not sell my data.',
        ], null, ['HTTP_SEC_GPC' => '1']);

        self::assertSame(202, $this->client->getResponse()->getStatusCode(), json_encode($body));
        self::assertSame('received', $body['status'] ?? null);
        self::assertNotEmpty($body['reference'] ?? null);

        $row = $this->em->getRepository(PrivacyRequest::class)->find($body['reference']);
        self::assertInstanceOf(PrivacyRequest::class, $row);
        self::assertSame('do_not_sell', $row->getType());
        self::assertTrue($row->isCaliforniaResident());
        self::assertTrue($row->hasGpcSignal());
    }

    public function testAdminCanCompleteRequest(): void
    {
        $this->jsonRequest('POST', '/api/privacy/requests', [
            'type' => 'access',
            'name' => 'Bea',
            'email' => 'bea@example.com',
            'gpcSignal' => true,
        ]);
        self::assertSame(202, $this->client->getResponse()->getStatusCode());

        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $list = $this->jsonRequest('GET', '/api/admin/privacy-requests', [], $admin);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertNotEmpty($list);
        $id = (int) $list[0]['id'];

        self::assertArrayHasKey('dueAt', $list[0]);
        self::assertArrayHasKey('overdue', $list[0]);
        self::assertTrue($list[0]['open'] ?? false);
        self::assertTrue($list[0]['gpcSignal'] ?? false);

        $updated = $this->jsonRequest('PATCH', '/api/admin/privacy-requests/'.$id, [
            'status' => 'completed',
            'adminNotes' => 'Fulfilled.',
        ], $admin);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), json_encode($updated));
        self::assertSame('completed', $updated['status'] ?? null);
        self::assertFalse($updated['open'] ?? true);
        self::assertFalse($updated['overdue'] ?? true);
    }

    public function testPublicSubmitCreatesTakedownRequest(): void
    {
        $body = $this->jsonRequest('POST', '/api/privacy/requests', [
            'type' => 'takedown',
            'name' => 'Rights Holder',
            'email' => 'legal@publisher.example',
            'details' => 'Please remove the promotional art on /s/demo/cards/1',
        ]);

        self::assertSame(202, $this->client->getResponse()->getStatusCode(), json_encode($body));
        $row = $this->em->getRepository(PrivacyRequest::class)->find($body['reference']);
        self::assertInstanceOf(PrivacyRequest::class, $row);
        self::assertSame('takedown', $row->getType());
    }

    public function testTakedownRequiresDetails(): void
    {
        $body = $this->jsonRequest('POST', '/api/privacy/requests', [
            'type' => 'takedown',
            'name' => 'Rights Holder',
            'email' => 'legal@publisher.example',
        ]);

        self::assertSame(422, $this->client->getResponse()->getStatusCode(), json_encode($body));
        self::assertStringContainsString('Describe', (string) ($body['detail'] ?? ''));
    }

    public function testOwnerCannotListPrivacyRequests(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->jsonRequest('GET', '/api/admin/privacy-requests', [], $owner);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }
}
