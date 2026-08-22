<?php

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class LegalSiteTest extends WebTestCase
{
    public function testLegalSiteIsPublic(): void
    {
        $client = static::createClient();
        $client->request('GET', '/api/legal/site');
        self::assertSame(200, $client->getResponse()->getStatusCode());
        $body = json_decode((string) $client->getResponse()->getContent(), true);
        self::assertIsArray($body);
        self::assertSame('LGS Card Vault', $body['entityName'] ?? null);
        self::assertTrue($body['pickupOnly'] ?? false);
        self::assertSame('US', $body['country'] ?? null);
        self::assertNotEmpty($body['contactEmail'] ?? null);
    }
}
