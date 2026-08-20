<?php

namespace App\Service\Recommend\Intelligence;

use App\Entity\Card;
use App\Service\CaseCards\ColorIdentityParser;

/**
 * The hard gate. No recommendation signal — popularity, synergy, package
 * completion, reference frequency — can move a card past this.
 *
 * Applied during candidate generation rather than scoring, so an illegal card is
 * never even a candidate and cannot leak through a code path that forgets to
 * check. Deck assembly re-checks singleton state as it picks, because that
 * constraint depends on what has already been chosen.
 */
final class CommanderLegalityValidator
{
    public const REASON_COLOR_IDENTITY = 'color_identity';
    public const REASON_FORMAT = 'format';
    public const REASON_DUPLICATE = 'duplicate';
    public const REASON_IS_COMMANDER = 'is_commander';

    /** Statuses that permit a card in a Commander deck. */
    private const LEGAL_STATUSES = ['legal', 'restricted'];

    public function __construct(
        private readonly ColorIdentityParser $colorIdentity,
    ) {
    }

    /**
     * Whether a card may legally join this commander's deck.
     *
     * @param array<string, true> $pickedOracleIds already-chosen oracle ids, for the singleton rule
     */
    public function rejectionReason(Card $commander, Card $card, array $pickedOracleIds = []): ?string
    {
        $oracleKey = strtolower((string) $card->getOracleId());

        if ($oracleKey === strtolower((string) $commander->getOracleId())) {
            return self::REASON_IS_COMMANDER;
        }

        if (!$this->colorIdentity->isSubsetOf($commander->getColorIdentity(), $card->getColorIdentity())) {
            return self::REASON_COLOR_IDENTITY;
        }

        if (!$this->isFormatLegal($card)) {
            return self::REASON_FORMAT;
        }

        // Singleton: one copy of any nonbasic card. Basic lands are the
        // exception and may repeat freely.
        if (isset($pickedOracleIds[$oracleKey]) && !$this->isBasicLand($card)) {
            return self::REASON_DUPLICATE;
        }

        return null;
    }

    public function isLegal(Card $commander, Card $card, array $pickedOracleIds = []): bool
    {
        return null === $this->rejectionReason($commander, $card, $pickedOracleIds);
    }

    /**
     * Commander format legality from Scryfall's `legalities` map.
     *
     * Absent or unrecognised data is treated as NOT legal. The previous
     * behaviour defaulted to legal when the key was missing, which quietly let
     * banned and un-set cards through for any card whose legality had not been
     * synced. For a rules-enforcing feature, failing closed is the only safe
     * default — a card we cannot vouch for should not be recommended.
     */
    public function isFormatLegal(Card $card): bool
    {
        $legalities = $card->getLegalities();
        if (!is_array($legalities)) {
            return false;
        }

        $status = $legalities['commander'] ?? null;
        if (!is_string($status)) {
            return false;
        }

        return in_array(strtolower($status), self::LEGAL_STATUSES, true);
    }

    public function isBasicLand(Card $card): bool
    {
        $type = strtolower($card->getTypeLine() ?? '');

        return str_contains($type, 'basic') && str_contains($type, 'land');
    }

    /**
     * Whether a card can lead a Commander deck. Mirrors the check the controller
     * already applies, kept here so validation lives in one place.
     */
    public function canBeCommander(Card $card): bool
    {
        if (!$this->isFormatLegal($card)) {
            return false;
        }

        $type = strtolower($card->getTypeLine() ?? '');
        if (str_contains($type, 'legendary') && str_contains($type, 'creature')) {
            return true;
        }

        // "Can be your commander" covers planeswalkers, backgrounds, and the
        // various one-off permissions.
        return str_contains(strtolower($card->getOracleText() ?? ''), 'can be your commander');
    }
}
