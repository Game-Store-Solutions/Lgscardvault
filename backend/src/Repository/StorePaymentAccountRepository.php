<?php

namespace App\Repository;

use App\Entity\Store;
use App\Entity\StorePaymentAccount;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<StorePaymentAccount>
 */
class StorePaymentAccountRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, StorePaymentAccount::class);
    }

    public function findOneForStoreAndProvider(Store $store, string $provider): ?StorePaymentAccount
    {
        return $this->findOneBy(['store' => $store, 'provider' => $provider]);
    }

    /** Webhooks identify the store only by Square's merchant id. */
    public function findOneByMerchantId(string $merchantId, string $provider = StorePaymentAccount::PROVIDER_SQUARE): ?StorePaymentAccount
    {
        return $this->findOneBy(['providerMerchantId' => $merchantId, 'provider' => $provider]);
    }

    public function getOrCreateForStoreAndProvider(Store $store, string $provider): StorePaymentAccount
    {
        $account = $this->findOneForStoreAndProvider($store, $provider);
        if ($account instanceof StorePaymentAccount) {
            return $account;
        }

        return (new StorePaymentAccount())
            ->setStore($store)
            ->setProvider($provider);
    }
}
