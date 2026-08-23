<?php

namespace App\Tests\Controller;

use App\Entity\ComplianceDocument;
use App\Entity\Store;
use App\Entity\User;
use App\Service\Compliance\StoreComplianceGate;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
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
        $store->setRegion('CA');
        $store->setCompliance(StoreComplianceGate::normalize([
            'legalBusinessName' => 'Pending Cards LLC',
            'entityType' => 'llc',
            'sellerPermitNumber' => 'SR-1',
            'insuranceAttested' => true,
        ]));
        $this->em->flush();

        return $store;
    }

    /**
     * Lexik JWT ignores session loginUser across multiple requests once the
     * firewall resets — pass an explicit Bearer token instead.
     *
     * @param array<string, mixed> $server
     */
    private function authRequest(User $user, string $method, string $url, array $server = [], string $content = ''): void
    {
        $token = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
        $server['HTTP_AUTHORIZATION'] = 'Bearer '.$token;
        $this->client->request($method, $url, server: $server, content: $content);
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

    public function testApproveStoreRequiresLicenseIntake(): void
    {
        $store = $this->fixtures->store('bare-pending');
        $store->setStatus(Store::STATUS_PENDING);
        $store->setIsActive(false);
        $store->setRegion('CA');
        $this->em->flush();

        $this->client->loginUser($this->fixtures->user(['ROLE_SUPER_ADMIN']));
        $this->client->request('POST', sprintf('/api/admin/stores/%d/approve', $store->getId()));
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
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

        $this->authRequest($admin, 'POST', sprintf('/api/admin/stores/%d/disable', $id));
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $disabled = $this->em->getRepository(Store::class)->find($id);
        self::assertFalse($disabled->isActive());
        self::assertFalse($disabled->isFeatured());

        $admin = $this->em->getRepository(User::class)->find($admin->getId());
        $this->authRequest($admin, 'POST', sprintf('/api/admin/stores/%d/enable', $id));
        self::assertResponseIsSuccessful();

        $this->em->clear();
        $enabled = $this->em->getRepository(Store::class)->find($id);
        self::assertTrue($enabled->isActive());
        self::assertSame(Store::STATUS_APPROVED, $enabled->getStatus());
    }

    public function testEnableDoesNotApproveAPendingStore(): void
    {
        $store = $this->pendingStore();
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);

        $this->authRequest($admin, 'POST', sprintf('/api/admin/stores/%d/enable', $store->getId()));
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        $reloaded = $this->em->getRepository(Store::class)->find($store->getId());
        self::assertSame(Store::STATUS_PENDING, $reloaded->getStatus());
        self::assertFalse($reloaded->isActive());
    }

    public function testAdminPatchCannotActivateAPendingStore(): void
    {
        $store = $this->pendingStore();
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);

        $this->authRequest(
            $admin,
            'PATCH',
            sprintf('/api/admin/stores/%d', $store->getId()),
            ['CONTENT_TYPE' => 'application/merge-patch+json'],
            (string) json_encode(['isActive' => true]),
        );
        self::assertSame(422, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        $reloaded = $this->em->getRepository(Store::class)->find($store->getId());
        self::assertFalse($reloaded->isActive());
        self::assertSame(Store::STATUS_PENDING, $reloaded->getStatus());
    }

    public function testDeleteStoreRequiresSlugConfirmation(): void
    {
        $store = $this->fixtures->store('doomed-store');
        $id = (int) $store->getId();
        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);

        $this->authRequest(
            $admin,
            'POST',
            sprintf('/api/admin/stores/%d/delete', $id),
            ['CONTENT_TYPE' => 'application/json'],
            (string) json_encode(['confirmSlug' => 'wrong-slug']),
        );
        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        self::assertNotNull($this->em->getRepository(Store::class)->find($id));

        $this->authRequest(
            $admin,
            'POST',
            sprintf('/api/admin/stores/%d/delete', $id),
            ['CONTENT_TYPE' => 'application/json'],
            (string) json_encode(['confirmSlug' => 'doomed-store']),
        );
        self::assertResponseIsSuccessful();

        $this->em->clear();
        self::assertNull($this->em->getRepository(Store::class)->find($id));
    }

    public function testAdminStoreListIncludesComplianceDocuments(): void
    {
        $store = $this->pendingStore();
        $document = new ComplianceDocument(
            $store->getOwner(),
            ComplianceDocument::KIND_SELLER_PERMIT,
            bin2hex(random_bytes(16)).'.pdf',
            'seller-permit.pdf',
            'application/pdf',
        );
        $document->setStore($store);
        $store->getComplianceDocuments()->add($document);
        $this->em->persist($document);
        $this->em->flush();

        $admin = $this->fixtures->user(['ROLE_SUPER_ADMIN']);
        $this->authRequest($admin, 'GET', '/api/admin/stores');
        self::assertResponseIsSuccessful();

        $body = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertIsArray($body);
        $members = $body['member'] ?? $body['hydra:member'] ?? $body;
        self::assertIsArray($members);

        $found = null;
        foreach ($members as $row) {
            if (($row['id'] ?? null) === $store->getId()) {
                $found = $row;
                break;
            }
        }
        self::assertIsArray($found);
        self::assertIsArray($found['complianceDocuments'] ?? null);
        self::assertCount(1, $found['complianceDocuments']);
        self::assertSame($document->getId(), $found['complianceDocuments'][0]['id'] ?? null);
        self::assertSame('seller_permit', $found['complianceDocuments'][0]['kind'] ?? null);
        self::assertSame('seller-permit.pdf', $found['complianceDocuments'][0]['originalFilename'] ?? null);
        self::assertSame('application/pdf', $found['complianceDocuments'][0]['mime'] ?? null);
        self::assertArrayNotHasKey('storageKey', $found['complianceDocuments'][0]);
    }
}
