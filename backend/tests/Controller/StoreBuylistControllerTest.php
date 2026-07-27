<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Sell/Trade portal: the store curates a buy list, customers submit against
 * it (offers snapshotted, quantities clamped), staff decide submissions
 * through a one-way status machine.
 */
final class StoreBuylistControllerTest extends WebTestCase
{
    private EntityManagerInterface $em;
    private CatalogFixtures $fixtures;
    private object $client;
    private ?string $bearer = null;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $c = static::getContainer();
        $this->em = $c->get('doctrine')->getManager();
        $this->fixtures = new CatalogFixtures($this->em);
    }

    private function authenticate(?User $user): void
    {
        $this->bearer = null === $user
            ? null
            : static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
    }

    private function jsonRequest(string $method, string $url, ?array $body = null): array
    {
        $server = ['CONTENT_TYPE' => 'application/json'];
        if (null !== $this->bearer) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$this->bearer;
        }

        $this->client->request($method, $url, server: $server, content: null === $body ? '' : json_encode($body));
        $raw = $this->client->getResponse()->getContent();

        return '' === $raw ? [] : (json_decode($raw, true) ?? []);
    }

    public function testBuylistCurationAndSellSubmissionFlow(): void
    {
        $store = $this->fixtures->store();
        $card = $this->fixtures->card(970);
        $customer = $this->fixtures->user(['ROLE_USER']);
        $base = "/api/stores/{$store->getSlug()}";

        // Owner curates: add an entry with an offer and a cap of 2 copies.
        $this->authenticate($store->getOwner());
        $entry = $this->jsonRequest('POST', "$base/buylist", [
            'cardId' => (string) $card->getId(),
            'offerCents' => 750,
            'maxQuantity' => 2,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        // The buy list is public.
        $this->authenticate(null);
        $publicList = $this->jsonRequest('GET', "$base/buylist");
        self::assertCount(1, $publicList);
        self::assertSame(750, $publicList[0]['offerCents']);

        // Customers cannot curate.
        $this->authenticate($customer);
        $this->jsonRequest('POST', "$base/buylist", ['cardId' => (string) $card->getId(), 'offerCents' => 1]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        // Customer submits 5 copies split across two lines — merged and
        // clamped to the entry's cap of 2 (split lines can't dodge the cap).
        $submission = $this->jsonRequest('POST', "$base/sell-submissions", [
            'items' => [
                ['buylistEntryId' => $entry['id'], 'quantity' => 3],
                ['buylistEntryId' => $entry['id'], 'quantity' => 2],
            ],
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());
        self::assertSame('pending', $submission['status']);
        self::assertCount(1, $submission['items']);
        self::assertSame(2, $submission['items'][0]['quantity']);
        self::assertSame(1500, $submission['totalOfferCents']);

        // Later buylist repricing never rewrites the in-flight submission.
        $this->authenticate($store->getOwner());
        $this->jsonRequest('PATCH', "$base/buylist/{$entry['id']}", ['offerCents' => 100]);
        self::assertResponseIsSuccessful();

        $this->authenticate($customer);
        $mine = $this->jsonRequest('GET', "$base/customer/sell-submissions");
        self::assertCount(1, $mine);
        self::assertSame(1500, $mine[0]['totalOfferCents'], 'the offer snapshot survives buylist edits');

        // Staff decide: pending → accepted → completed; completed is terminal.
        $this->authenticate($store->getOwner());
        $updated = $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'accepted']);
        self::assertSame('accepted', $updated['status']);
        $updated = $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'completed']);
        self::assertSame('completed', $updated['status']);
        $this->jsonRequest('PATCH', "$base/sell-submissions/{$submission['id']}", ['status' => 'declined']);
        self::assertSame(409, $this->client->getResponse()->getStatusCode());
    }
}
