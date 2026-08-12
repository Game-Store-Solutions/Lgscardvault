<?php

namespace App\Tests\Controller;

use App\Entity\Store;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Platform-admin actions must be reachable only by ROLE_SUPER_ADMIN and must
 * perform their effect. Covers the catalog sync trigger and store approval /
 * rejection, plus the authorization boundary (a store owner is not an admin).
 */
final class AdminActionsTest extends WebTestCase
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

    private function pendingStore(): Store
    {
        $store = $this->fixtures->store('pending-store');
        $store->setStatus(Store::STATUS_PENDING);
        $store->setIsActive(false);
        $this->em->flush();

        return $store;
    }

    public function testScryfallSyncQueuesForSuperAdmin(): void
    {
        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));
        $this->client->request(
            'POST',
            '/api/admin/scryfall/sync',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['type' => 'oracle_cards']),
        );

        self::assertSame(202, $this->client->getResponse()->getStatusCode());
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame('queued', $body['status']);
        self::assertSame('oracle_cards', $body['type']);
        self::assertIsArray($body['run'] ?? null);
        self::assertSame('queued', $body['run']['status']);
        self::assertSame('oracle_cards', $body['run']['bulkType']);
    }

    public function testScryfallSyncRejectsUnknownType(): void
    {
        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));
        $this->client->request(
            'POST',
            '/api/admin/scryfall/sync',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['type' => 'not_a_real_dataset']),
        );

        self::assertSame(400, $this->client->getResponse()->getStatusCode());
    }

    public function testScryfallSyncForbiddenForNonAdmin(): void
    {
        $this->client->loginUser($this->fixtures->user(['ROLE_USER']));
        $this->client->request('POST', '/api/admin/scryfall/sync', server: ['CONTENT_TYPE' => 'application/json'], content: '{}');

        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    public function testApproveStoreFlipsItLive(): void
    {
        $store = $this->pendingStore();
        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));

        $this->client->request('POST', sprintf('/api/admin/stores/%d/approve', $store->getId()));
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $reloaded = $this->em->getRepository(Store::class)->find($store->getId());
        self::assertSame(Store::STATUS_APPROVED, $reloaded->getStatus());
        self::assertTrue($reloaded->isActive());
    }

    public function testRejectStoreRecordsReason(): void
    {
        $store = $this->pendingStore();
        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));

        $this->client->request(
            'POST',
            sprintf('/api/admin/stores/%d/reject', $store->getId()),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['reason' => 'Incomplete application']),
        );
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $reloaded = $this->em->getRepository(Store::class)->find($store->getId());
        self::assertSame(Store::STATUS_REJECTED, $reloaded->getStatus());
    }

    public function testApproveStoreForbiddenForNonAdmin(): void
    {
        $store = $this->pendingStore();
        $this->client->loginUser($this->fixtures->user(['ROLE_USER']));

        $this->client->request('POST', sprintf('/api/admin/stores/%d/approve', $store->getId()));
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
    }

    public function testDisableAndEnableStore(): void
    {
        $store = $this->fixtures->store('live-store');
        $store->setStatus(Store::STATUS_APPROVED);
        $store->setIsActive(true);
        $store->setFeatured(true);
        $this->em->flush();
        $id = (int) $store->getId();
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);

        $this->client->loginUser($admin);
        $this->client->request('POST', sprintf('/api/admin/stores/%d/disable', $id));
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $disabled = $this->em->getRepository(Store::class)->find($id);
        self::assertFalse($disabled->isActive());
        self::assertFalse($disabled->isFeatured());

        // Re-authenticate after EntityManager::clear() — the JWT test token
        // holds a detached User and the next request otherwise returns 401.
        $this->client->loginUser($this->em->getRepository(\App\Entity\User::class)->find($admin->getId()));
        $this->client->request('POST', sprintf('/api/admin/stores/%d/enable', $id));
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $enabled = $this->em->getRepository(Store::class)->find($id);
        self::assertTrue($enabled->isActive());
        self::assertSame(Store::STATUS_APPROVED, $enabled->getStatus());
    }

    public function testDeleteStoreRequiresSlugConfirmation(): void
    {
        $store = $this->fixtures->store('doomed-store');
        $id = (int) $store->getId();
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $this->client->loginUser($admin);

        $this->client->request(
            'POST',
            sprintf('/api/admin/stores/%d/delete', $id),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['confirmSlug' => 'wrong-slug']),
        );
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertNotNull($this->em->getRepository(Store::class)->find($id));

        $this->client->loginUser($admin);
        $this->client->request(
            'POST',
            sprintf('/api/admin/stores/%d/delete', $id),
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['confirmSlug' => 'doomed-store']),
        );
        self::assertResponseIsSuccessful();

        $this->em->clear();
        self::assertNull($this->em->getRepository(Store::class)->find($id));
    }
}
