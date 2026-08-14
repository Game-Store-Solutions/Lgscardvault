<?php

namespace App\Service\Store;

use App\Entity\Store;
use App\Service\Mail\TransactionalMailer;

/**
 * Store onboarding application outcome emails (platform-branded).
 */
final class StoreApplicationMailer
{
    public function __construct(private readonly TransactionalMailer $mail)
    {
    }

    public function sendApproved(Store $store): void
    {
        $this->mail->sendStoreApproved($store);
    }

    public function sendRejected(Store $store, ?string $reason): void
    {
        $this->mail->sendStoreRejected($store, $reason);
    }
}
