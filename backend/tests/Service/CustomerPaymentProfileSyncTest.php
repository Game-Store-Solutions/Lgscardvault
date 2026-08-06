<?php

namespace App\Tests\Service;

use App\Entity\StoreCustomer;
use App\Entity\User;
use App\Repository\StoreCustomerRepository;
use App\Service\Payments\CustomerPaymentProfileSync;
use PHPUnit\Framework\TestCase;

final class CustomerPaymentProfileSyncTest extends TestCase
{
    public function testSyncCopiesWalletDisplayWithoutClearingStoreVaultIds(): void
    {
        $user = (new User())
            ->setEmail('shopper@example.com')
            ->setDisplayName('Shopper')
            ->setPaymentLast4('4242')
            ->setPaymentBrand('VISA')
            ->setPaymentExpires('12/30')
            ->setPaymentMethodType('card');

        $customer = (new StoreCustomer())
            ->setPaymentCustomerId('sq-customer-1')
            ->setPaymentCardId('sq-card-1')
            ->setPaymentLast4('1111')
            ->setPaymentBrand('MASTERCARD');

        $repo = $this->createMock(StoreCustomerRepository::class);
        (new CustomerPaymentProfileSync($repo))->applyUserPaymentToStoreCustomer($user, $customer);

        self::assertSame('sq-customer-1', $customer->getPaymentCustomerId());
        self::assertSame('sq-card-1', $customer->getPaymentCardId());
        self::assertSame('4242', $customer->getPaymentLast4());
        self::assertSame('VISA', $customer->getPaymentBrand());
        self::assertSame('12/30', $customer->getPaymentExpires());
    }
}
