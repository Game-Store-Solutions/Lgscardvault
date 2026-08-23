<?php

namespace App\Service\Legal;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

/** Operator-configurable identity used on public legal pages. */
final readonly class LegalSiteInfo
{
    public const ENTITY_NAME_DEFAULT = 'LGS Card Vault';
    public const CONTACT_EMAIL_DEFAULT = 'privacy@lgscardvault.com';

    public function __construct(
        #[Autowire('%env(default::LEGAL_ENTITY_NAME)%')]
        private ?string $entityName,
        #[Autowire('%env(default::LEGAL_CONTACT_EMAIL)%')]
        private ?string $contactEmail,
        #[Autowire('%env(default::LEGAL_ADDRESS)%')]
        private ?string $address,
    ) {
    }

    /** @return array{entityName: string, contactEmail: string, address: string, pickupOnly: bool, country: string} */
    public function toArray(): array
    {
        $entityName = trim((string) $this->entityName);
        $contactEmail = trim((string) $this->contactEmail);

        return [
            'entityName' => '' !== $entityName ? $entityName : self::ENTITY_NAME_DEFAULT,
            'contactEmail' => '' !== $contactEmail ? $contactEmail : self::CONTACT_EMAIL_DEFAULT,
            'address' => trim((string) $this->address),
            'pickupOnly' => true,
            'country' => 'US',
        ];
    }
}
