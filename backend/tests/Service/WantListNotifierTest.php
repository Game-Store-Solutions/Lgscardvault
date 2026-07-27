<?php

namespace App\Tests\Service;

use App\Entity\CustomerNotification;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Cross-store want-list fulfillment: a customer wanting a card at store A is
 * notified when ANY store lists that card — once per (user, store, card),
 * so restocks and re-imports never spam.
 */
final class WantListNotifierTest extends WebTestCase
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

    private function authenticate(User $user): void
    {
        $this->bearer = static::getContainer()->get(JWTTokenManagerInterface::class)->create($user);
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

    public function testListingAWantedCardNotifiesAcrossStoresOnce(): void
    {
        $storeA = $this->fixtures->store();
        $storeB = $this->fixtures->store();
        $card = $this->fixtures->card(950);
        $customer = $this->fixtures->user(['ROLE_USER']);

        // The customer wants the card at store A.
        $this->authenticate($customer);
        $this->jsonRequest('POST', "/api/stores/{$storeA->getSlug()}/customer/want-list", [
            'cardName' => $card->getName(),
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        // Store B lists it → the customer is notified about store B.
        $this->authenticate($storeB->getOwner());
        $this->jsonRequest('POST', "/api/stores/{$storeB->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 2,
            'priceCents' => 500,
            'condition' => 'NM',
            'isFoil' => false,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        $notifications = $this->em->getRepository(CustomerNotification::class)->findBy([
            'user' => $customer,
            'type' => CustomerNotification::TYPE_WANT_LIST_MATCH,
        ]);
        self::assertCount(1, $notifications);
        self::assertSame($storeB->getId(), $notifications[0]->getStore()?->getId());
        self::assertStringContainsString($card->getName(), $notifications[0]->getTitle());

        // Restocking the same card at the same store does not re-notify.
        $this->jsonRequest('POST', "/api/stores/{$storeB->getSlug()}/inventory", [
            'cardId' => (string) $card->getId(),
            'quantity' => 1,
            'priceCents' => 500,
            'condition' => 'NM',
            'isFoil' => false,
        ]);
        self::assertSame(201, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        $notifications = $this->em->getRepository(CustomerNotification::class)->findBy([
            'user' => $customer->getId(),
            'type' => CustomerNotification::TYPE_WANT_LIST_MATCH,
        ]);
        self::assertCount(1, $notifications, 'restocks are deduped');
    }
}
