<?php

namespace App\Tests\Controller;

use App\Entity\InventoryItem;
use App\Entity\SealedInventoryItem;
use App\Entity\SealedProduct;
use App\Entity\User;
use App\Tests\Support\CatalogFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Store owners can wipe their own singles + sealed listings from admin
 * settings, but only after typing the slug — and never another store's stock.
 */
final class StoreInventoryClearTest extends WebTestCase
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

    /** @param array<string, mixed>|null $body */
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

    private function sealedProduct(string $name): SealedProduct
    {
        static $productId = 810000;
        $game = $this->em->getRepository(\App\Entity\Game::class)->findOneBy(['code' => 'mtg']);
        self::assertNotNull($game);

        $product = new SealedProduct();
        $product->setGame($game);
        $product->setTcgcsvProductId(++$productId);
        $product->setName($name);
        $product->setMarketPriceCents(10000);
        $this->em->persist($product);
        $this->em->flush();

        return $product;
    }

    private function sealedLine(\App\Entity\Store $store, SealedProduct $product, int $quantity = 1): SealedInventoryItem
    {
        $item = (new SealedInventoryItem())
            ->setStore($store)
            ->setSealedProduct($product)
            ->setQuantity($quantity)
            ->setPriceCents(10000);
        $this->em->persist($item);
        $this->em->flush();

        return $item;
    }

    public function testOwnerCanClearSinglesAndSealedAfterConfirmingSlug(): void
    {
        $store = $this->fixtures->store('wipe-store');
        $other = $this->fixtures->store('keep-store');
        $card = $this->fixtures->card(811);
        $this->fixtures->inventoryItem($store, $card, quantity: 4);
        $this->fixtures->inventoryItem($store, $this->fixtures->card(812), quantity: 2);
        $this->fixtures->inventoryItem($other, $card, quantity: 9);
        $this->sealedLine($store, $this->sealedProduct('Wipe Box'), 3);
        $this->sealedLine($other, $this->sealedProduct('Keep Box'), 5);

        $this->authenticate($store->getOwner());
        $body = $this->jsonRequest('POST', '/api/stores/wipe-store/settings/clear-inventory', [
            'confirmSlug' => 'wipe-store',
        ]);

        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame(2, $body['deletedSingles']);
        self::assertSame(1, $body['deletedSealed']);

        $this->em->clear();
        self::assertSame(0, $this->em->getRepository(InventoryItem::class)->count(['store' => $store->getId()]));
        self::assertSame(0, $this->em->getRepository(SealedInventoryItem::class)->count(['store' => $store->getId()]));
        self::assertSame(1, $this->em->getRepository(InventoryItem::class)->count(['store' => $other->getId()]));
        self::assertSame(1, $this->em->getRepository(SealedInventoryItem::class)->count(['store' => $other->getId()]));
    }

    public function testClearRequiresMatchingSlug(): void
    {
        $store = $this->fixtures->store('confirm-wipe');
        $this->fixtures->inventoryItem($store, $this->fixtures->card(813));

        $this->authenticate($store->getOwner());
        $this->jsonRequest('POST', '/api/stores/confirm-wipe/settings/clear-inventory', [
            'confirmSlug' => 'wrong-slug',
        ]);

        self::assertSame(422, $this->client->getResponse()->getStatusCode());
        $this->em->clear();
        self::assertSame(1, $this->em->getRepository(InventoryItem::class)->count(['store' => $store->getId()]));
    }

    public function testClearIsForbiddenForOtherStoresAndGuests(): void
    {
        $store = $this->fixtures->store('locked-wipe');
        $this->fixtures->inventoryItem($store, $this->fixtures->card(814));

        $this->authenticate(null);
        $this->jsonRequest('POST', '/api/stores/locked-wipe/settings/clear-inventory', [
            'confirmSlug' => 'locked-wipe',
        ]);
        self::assertSame(401, $this->client->getResponse()->getStatusCode());

        $this->authenticate($this->fixtures->user());
        $this->jsonRequest('POST', '/api/stores/locked-wipe/settings/clear-inventory', [
            'confirmSlug' => 'locked-wipe',
        ]);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        $this->em->clear();
        self::assertSame(1, $this->em->getRepository(InventoryItem::class)->count(['store' => $store->getId()]));
    }
}
