<?php

namespace App\Service\Onboarding;

/** U.S. states and DC for storefront onboarding. */
final class UsRegion
{
    /** @var array<string, string> uppercase code => name */
    private const STATES = [
        'AL' => 'Alabama',
        'AK' => 'Alaska',
        'AZ' => 'Arizona',
        'AR' => 'Arkansas',
        'CA' => 'California',
        'CO' => 'Colorado',
        'CT' => 'Connecticut',
        'DE' => 'Delaware',
        'DC' => 'District of Columbia',
        'FL' => 'Florida',
        'GA' => 'Georgia',
        'HI' => 'Hawaii',
        'ID' => 'Idaho',
        'IL' => 'Illinois',
        'IN' => 'Indiana',
        'IA' => 'Iowa',
        'KS' => 'Kansas',
        'KY' => 'Kentucky',
        'LA' => 'Louisiana',
        'ME' => 'Maine',
        'MD' => 'Maryland',
        'MA' => 'Massachusetts',
        'MI' => 'Michigan',
        'MN' => 'Minnesota',
        'MS' => 'Mississippi',
        'MO' => 'Missouri',
        'MT' => 'Montana',
        'NE' => 'Nebraska',
        'NV' => 'Nevada',
        'NH' => 'New Hampshire',
        'NJ' => 'New Jersey',
        'NM' => 'New Mexico',
        'NY' => 'New York',
        'NC' => 'North Carolina',
        'ND' => 'North Dakota',
        'OH' => 'Ohio',
        'OK' => 'Oklahoma',
        'OR' => 'Oregon',
        'PA' => 'Pennsylvania',
        'RI' => 'Rhode Island',
        'SC' => 'South Carolina',
        'SD' => 'South Dakota',
        'TN' => 'Tennessee',
        'TX' => 'Texas',
        'UT' => 'Utah',
        'VT' => 'Vermont',
        'VA' => 'Virginia',
        'WA' => 'Washington',
        'WV' => 'West Virginia',
        'WI' => 'Wisconsin',
        'WY' => 'Wyoming',
    ];

    /** Normalize "CA" or "California" to a two-letter code, or null if unknown. */
    public static function normalize(string $region): ?string
    {
        $trimmed = trim($region);
        if ('' === $trimmed) {
            return null;
        }

        $upper = strtoupper($trimmed);
        if (isset(self::STATES[$upper])) {
            return $upper;
        }

        foreach (self::STATES as $code => $name) {
            if (strtoupper($name) === $upper) {
                return $code;
            }
        }

        return null;
    }

    /** States with no statewide sales tax (local taxes may still apply via Square). */
    public static function hasNoStateSalesTax(?string $region): bool
    {
        $code = null === $region ? null : self::normalize($region);

        return in_array($code, ['AK', 'DE', 'MT', 'NH', 'OR'], true);
    }

    /**
     * True only when we know the store is in a sales-tax state. Null/unknown
     * regions are not blocked (admin-provisioned and test stores).
     */
    public static function chargesStateSalesTax(?string $region): bool
    {
        $code = null === $region || '' === trim($region) ? null : self::normalize($region);
        if (null === $code) {
            return false;
        }

        return !self::hasNoStateSalesTax($code);
    }

    public static function cdtfaVerifyUrl(): string
    {
        return 'https://www.cdtfa.ca.gov/services/permits-licenses.htm';
    }
}
