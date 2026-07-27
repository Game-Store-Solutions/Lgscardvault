<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Order;
use App\Entity\OrderLine;
use App\Entity\Store;
use App\Entity\User;
use App\MultiTenancy\TenantContext;
use App\Repository\CardRepository;
use App\Repository\InventoryItemRepository;
use App\Repository\UserRepository;
use App\Service\CaseCards\SectionSaleAllocator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Uid\Uuid;

/**
 * Creates staff-entered orders (admin UI and in-store kiosk terminals).
 *
 * Lines may reference a concrete inventory listing (inventoryItemId) — those
 * behave exactly like customer checkout: the price defaults to the listing
 * price, quantity is capped by available stock, real stock is consumed at
 * placement, and case-section pools are depleted for pull sheets. Free-form
 * lines (card id / name only) remain supported for off-catalog sales and do
 * not touch stock.
 *
 * @implements ProcessorInterface<Order, Order>
 */
final readonly class StoreOrderProcessor implements ProcessorInterface
{
    public function __construct(
        private EntityManagerInterface $entityManager,
        private TenantContext $tenantContext,
        private CardRepository $cardRepository,
        private InventoryItemRepository $inventoryItemRepository,
        private UserRepository $userRepository,
        private SectionSaleAllocator $sectionSaleAllocator,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): Order
    {
        if (!$data instanceof Order) {
            throw new \InvalidArgumentException('Expected Order.');
        }

        $store = $this->tenantContext->getStore();
        if (!$store instanceof Store) {
            throw new NotFoundHttpException('Store not found.');
        }

        $inputLines = $data->getInputLines();
        if ([] === $inputLines) {
            throw new BadRequestHttpException('An order must contain at least one line.');
        }

        $data->setStore($store);
        $data->setReference(Order::generateReference());
        $this->attributeKioskCustomer($data);

        $total = 0;
        foreach ($inputLines as $i => $lineData) {
            if (!is_array($lineData)) {
                throw new BadRequestHttpException(sprintf('Line %d is invalid.', $i));
            }

            $line = isset($lineData['inventoryItemId'])
                ? $this->buildInventoryLine($store, $i, $lineData)
                : $this->buildFreeFormLine($i, $lineData);

            $data->addLine($line);
            $total += $line->getQuantity() * $line->getPriceCents();
        }

        $data->setTotalCents($total);

        $this->entityManager->persist($data);
        $this->entityManager->flush();

        return $data;
    }

    /**
     * Kiosk convenience: a user id typed at the terminal attributes the order
     * to that customer account (unless explicit name/email were provided).
     */
    private function attributeKioskCustomer(Order $order): void
    {
        $userId = $order->getKioskUserId();
        if (null === $userId) {
            return;
        }

        $user = $this->userRepository->find($userId);
        if (!$user instanceof User) {
            throw new BadRequestHttpException(sprintf('No customer account with user id %d.', $userId));
        }

        if (null === $order->getCustomerName() || '' === $order->getCustomerName()) {
            $order->setCustomerName($user->getDisplayName());
        }
        if (null === $order->getCustomerEmail() || '' === $order->getCustomerEmail()) {
            $order->setCustomerEmail($user->getEmail());
        }
    }

    /**
     * A line backed by a real listing: listing price by default, quantity
     * capped by stock, stock consumed, case pools depleted.
     *
     * @param array<string, mixed> $lineData
     */
    private function buildInventoryLine(Store $store, int $i, array $lineData): OrderLine
    {
        $item = $this->inventoryItemRepository->findOneByStoreAndId($store, (int) $lineData['inventoryItemId']);
        if (!$item instanceof InventoryItem) {
            throw new NotFoundHttpException(sprintf('Line %d references an unknown inventory listing.', $i));
        }

        $requested = (int) ($lineData['quantity'] ?? 1);
        if ($requested < 1) {
            throw new BadRequestHttpException(sprintf('Line %d must have a quantity of at least 1.', $i));
        }
        if ($item->getQuantity() < 1) {
            throw new BadRequestHttpException(sprintf('Line %d: "%s" is out of stock.', $i, $item->getCard()?->getName() ?? 'listing'));
        }

        $quantity = min($requested, $item->getQuantity());
        $priceCents = array_key_exists('priceCents', $lineData) ? (int) $lineData['priceCents'] : $item->getPriceCents();
        if ($priceCents < 0) {
            throw new BadRequestHttpException(sprintf('Line %d has an invalid price.', $i));
        }

        $line = (new OrderLine())
            ->setCard($item->getCard())
            ->setInventoryItem($item)
            ->setCardName($item->getCard()?->getName() ?? 'Unknown card')
            ->setQuantity($quantity)
            ->setPriceCents($priceCents);

        // Same stock rules as customer checkout: consume at placement (the
        // status processor restores on cancel/refund) and deplete case pools.
        $item->setQuantity($item->getQuantity() - $quantity);
        $this->sectionSaleAllocator->allocateLine($line, $item, $quantity);

        return $line;
    }

    /**
     * Off-catalog line (no listing): card reference optional, explicit price
     * required, stock untouched.
     *
     * @param array<string, mixed> $lineData
     */
    private function buildFreeFormLine(int $i, array $lineData): OrderLine
    {
        $quantity = (int) ($lineData['quantity'] ?? 0);
        $priceCents = (int) ($lineData['priceCents'] ?? 0);
        if ($quantity < 1) {
            throw new BadRequestHttpException(sprintf('Line %d must have a quantity of at least 1.', $i));
        }
        if ($priceCents < 0) {
            throw new BadRequestHttpException(sprintf('Line %d has an invalid price.', $i));
        }

        $card = null;
        $cardId = $lineData['cardId'] ?? null;
        if (is_string($cardId) && '' !== $cardId) {
            try {
                $card = $this->cardRepository->find(Uuid::fromString($cardId));
            } catch (\InvalidArgumentException) {
                throw new BadRequestHttpException(sprintf('Line %d has an invalid card id.', $i));
            }
            if (!$card instanceof Card) {
                throw new NotFoundHttpException(sprintf('Line %d references an unknown card.', $i));
            }
        }

        $cardName = (string) ($lineData['cardName'] ?? $card?->getName() ?? '');
        if ('' === $cardName) {
            throw new BadRequestHttpException(sprintf('Line %d requires a card or card name.', $i));
        }

        return (new OrderLine())
            ->setCard($card)
            ->setCardName($cardName)
            ->setQuantity($quantity)
            ->setPriceCents($priceCents);
    }
}
