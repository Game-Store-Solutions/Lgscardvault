<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/** Phase 1: Vault | Campaign | Studio persist via settings PATCH and public store read. */
final class StoreSettingsStorefrontTemplateTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private Store $store;
    private string $bearer;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
        $this->store = $this->fixtures->store('storefront-template-store');
        $this->bearer = $c->get(JWTTokenManagerInterface::class)->create($this->store->getOwner());
    }

    /** @param array<string, mixed> $body */
    private function patchSettings(array $body, bool $assertOk = true): array
    {
        $this->client->request(
            'PATCH',
            sprintf('/api/stores/%s/settings', $this->store->getSlug()),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->bearer,
            ],
            content: json_encode($body),
        );
        if ($assertOk) {
            self::assertResponseIsSuccessful();
        }

        return json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    private function readStore(): array
    {
        $this->client->request('GET', sprintf('/api/stores/%s', $this->store->getSlug()));
        self::assertResponseIsSuccessful();

        return json_decode($this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testDefaultTemplateIsVault(): void
    {
        $read = $this->readStore();
        self::assertSame('vault', $read['storefrontTemplate'] ?? null);
    }

    public function testEachTemplatePersistsAndIsExposedOnStoreRead(): void
    {
        foreach (['campaign', 'studio', 'vault'] as $template) {
            $patch = $this->patchSettings(['storefrontTemplate' => $template]);
            self::assertSame($template, $patch['storefrontTemplate'] ?? null, "PATCH response for {$template}");

            $read = $this->readStore();
            self::assertSame($template, $read['storefrontTemplate'] ?? null, "GET store read for {$template}");
        }
    }

    public function testRevertToVaultIsASinglePatch(): void
    {
        $this->patchSettings(['storefrontTemplate' => 'campaign']);
        $patch = $this->patchSettings(['storefrontTemplate' => 'vault']);
        self::assertSame('vault', $patch['storefrontTemplate']);
        self::assertSame('vault', $this->readStore()['storefrontTemplate']);
    }

    public function testUnknownTemplateIsRejected(): void
    {
        $this->patchSettings(['storefrontTemplate' => 'binder'], false);
        self::assertResponseStatusCodeSame(422);
    }

    public function testTemplateDoesNotChangeInventoryOrCheckoutFields(): void
    {
        $before = $this->readStore();
        $this->patchSettings(['storefrontTemplate' => 'studio']);
        $after = $this->readStore();

        self::assertSame($before['cardDisplayStyle'] ?? 'gallery', $after['cardDisplayStyle'] ?? 'gallery');
        self::assertSame($before['heroLayout'] ?? 'cinematic', $after['heroLayout'] ?? 'cinematic');
        self::assertSame($before['features'] ?? [], $after['features'] ?? []);
        self::assertSame('studio', $after['storefrontTemplate']);
    }
}
