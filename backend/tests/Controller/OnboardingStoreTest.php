<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class OnboardingStoreTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $container = static::getContainer();
        $this->em = $container->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    /** @param array<string, mixed> $body */
    private function jsonRequest(string $method, string $url, array $body = []): array
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }
        $this->client->request($method, $url, server: $server, content: json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    /** @return array<string, mixed> */
    private function validPayload(string $slug, array $overrides = []): array
    {
        return array_replace_recursive([
            'name' => 'Bay Area Cards',
            'slug' => $slug,
            'planKey' => 'starter',
            'phone' => '4155550100',
            'acceptedMerchantTerms' => true,
            'address' => [
                'addressLine1' => '123 Market St',
                'city' => 'San Francisco',
                'region' => 'CA',
                'postalCode' => '94103',
                'country' => 'US',
            ],
        ], $overrides);
    }

    public function testSubmitCreatesPendingUsStore(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);

        $slug = 'bay-cards-'.bin2hex(random_bytes(3));
        $created = $this->jsonRequest('POST', '/api/onboarding/store', $this->validPayload($slug, [
            'address' => ['region' => 'California'],
        ]));

        self::assertSame(201, $this->client->getResponse()->getStatusCode(), json_encode($created));
        self::assertSame($slug, $created['slug'] ?? null);
        self::assertSame(Store::STATUS_PENDING, $created['status'] ?? null);

        $store = $this->em->getRepository(Store::class)->findOneBy(['slug' => $slug]);
        self::assertInstanceOf(Store::class, $store);
        self::assertSame('US', $store->getCountry());
        self::assertSame('CA', $store->getRegion());
    }

    public function testSubmitRejectsNonUsCountry(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);

        $body = $this->jsonRequest('POST', '/api/onboarding/store', $this->validPayload('canada-shop', [
            'address' => ['country' => 'CA', 'region' => 'ON'],
        ]));

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('United States', (string) ($body['error'] ?? ''));
    }

    public function testSubmitRequiresMerchantTerms(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);

        $body = $this->jsonRequest('POST', '/api/onboarding/store', $this->validPayload('no-terms-shop', [
            'acceptedMerchantTerms' => false,
        ]));

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('merchant terms', strtolower((string) ($body['error'] ?? '')));
    }

    public function testSubmitRequiresValidState(): void
    {
        $owner = $this->fixtures->user(['ROLE_STORE_OWNER']);
        $this->authenticate($owner);

        $body = $this->jsonRequest('POST', '/api/onboarding/store', $this->validPayload('no-state-shop', [
            'address' => ['region' => 'ZZ'],
        ]));

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
        self::assertStringContainsString('state', strtolower((string) ($body['error'] ?? '')));
    }
}
