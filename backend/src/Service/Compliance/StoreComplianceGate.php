<?php

namespace App\Service\Compliance;

use App\Entity\ComplianceDocument;
use App\Entity\Store;
use App\Service\Onboarding\UsRegion;

/** Whether a pending store has enough license intake to go live. */
final class StoreComplianceGate
{
    public const ENTITY_TYPES = ['sole_prop', 'llc', 'corp', 'partnership', 'other'];
    public const SECONDHAND = ['not_applicable', 'will_comply', 'licensed'];

    /**
     * @param array<string, mixed> $raw
     *
     * @return array<string, mixed>
     */
    public static function normalize(array $raw): array
    {
        $entity = (string) ($raw['entityType'] ?? '');
        $secondhand = (string) ($raw['secondhandStatus'] ?? 'not_applicable');

        return [
            'legalBusinessName' => mb_substr(trim((string) ($raw['legalBusinessName'] ?? '')), 0, 255),
            'entityType' => in_array($entity, self::ENTITY_TYPES, true) ? $entity : '',
            'sellerPermitNumber' => mb_substr(trim((string) ($raw['sellerPermitNumber'] ?? '')), 0, 64),
            'ein' => mb_substr(preg_replace('/[^0-9-]/', '', (string) ($raw['ein'] ?? '')) ?? '', 0, 20),
            'noStateSalesTax' => self::isTruthy($raw['noStateSalesTax'] ?? false),
            'cityLicenseNumber' => mb_substr(trim((string) ($raw['cityLicenseNumber'] ?? '')), 0, 64),
            'usesBuyTrade' => self::isTruthy($raw['usesBuyTrade'] ?? false),
            'secondhandStatus' => in_array($secondhand, self::SECONDHAND, true) ? $secondhand : 'not_applicable',
            'secondhandLicenseNumber' => mb_substr(trim((string) ($raw['secondhandLicenseNumber'] ?? '')), 0, 64),
            'insuranceAttested' => self::isTruthy($raw['insuranceAttested'] ?? false),
        ];
    }

    /** @return list<string> */
    public static function errors(Store $store): array
    {
        $c = self::normalize($store->getCompliance());
        $errors = [];
        if ('' === $c['legalBusinessName']) {
            $errors[] = 'Legal business name is required.';
        }
        if ('' === $c['entityType']) {
            $errors[] = 'Select a business entity type.';
        }
        if (!$c['insuranceAttested']) {
            $errors[] = 'Confirm that you carry business insurance appropriate for an in-person retail shop.';
        }

        $region = UsRegion::normalize((string) $store->getRegion());
        $hasPermit = '' !== $c['sellerPermitNumber'] || $store->hasComplianceDocument(ComplianceDocument::KIND_SELLER_PERMIT);
        if (UsRegion::hasNoStateSalesTax($region)) {
            if (!$c['noStateSalesTax']) {
                $errors[] = 'Confirm that your state has no statewide sales tax permit.';
            }
        } elseif (!$hasPermit) {
            $errors[] = 'Enter your seller’s permit / sales-tax license number or upload the document.';
        }

        if ($c['usesBuyTrade']) {
            if ('not_applicable' === $c['secondhandStatus']) {
                $errors[] = 'If you buy or trade cards from the public, say how you handle secondhand-dealer rules.';
            }
            if ('licensed' === $c['secondhandStatus']) {
                $hasSecondhand = '' !== $c['secondhandLicenseNumber']
                    || $store->hasComplianceDocument(ComplianceDocument::KIND_SECONDHAND);
                if (!$hasSecondhand) {
                    $errors[] = 'Enter or upload your secondhand-dealer / pawn license.';
                }
            }
        }

        return $errors;
    }

    private static function isTruthy(mixed $value): bool
    {
        return true === $value || 1 === $value || '1' === $value || 'true' === $value;
    }
}
