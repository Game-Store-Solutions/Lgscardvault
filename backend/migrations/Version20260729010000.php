<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Replaces the foil/not-foil boolean with the treatment's own name.
 *
 * "Foil" is Magic's word. Pokemon sells Holofoil, Reverse Holofoil and 1st
 * Edition Holofoil; Flesh and Blood sells Rainbow Foil and Cold Foil. A
 * boolean cannot tell those apart, so a store could not price or count them
 * separately — every one of them collapsed onto a single "foil" listing.
 *
 * The backfill translates each existing row into its game's word for the
 * side of the axis it was already on, so nothing reads as Magic terminology
 * on a Pokemon shelf after the deploy. The mapping is duplicated here rather
 * than read from FinishVocabulary on purpose: a migration is a snapshot and
 * must not change meaning when the application's defaults do.
 *
 * Both directions are lossless for the two-value case and lossy only where
 * a store has since used a treatment beyond plain/foil — down() folds those
 * back onto the boolean, which is the best a boolean can hold.
 */
final class Version20260729010000 extends AbstractMigration
{
    /** code => [plain, foil], matching FinishVocabulary at the time of writing. */
    private const GAME_FINISHES = [
        'mtg' => ['Nonfoil', 'Foil'],
        'pokemon' => ['Normal', 'Holofoil'],
        'onepiece' => ['Normal', 'Foil'],
        'fab' => ['Normal', 'Rainbow Foil'],
        'riftbound' => ['Normal', 'Foil'],
    ];

    public function getDescription(): string
    {
        return 'Store the treatment name (finish) instead of a foil boolean';
    }

    public function up(Schema $schema): void
    {
        // --- inventory: the finish is part of a listing's identity ---------
        $this->addSql("ALTER TABLE inventory_items ADD finish VARCHAR(40) DEFAULT 'Nonfoil' NOT NULL");
        $this->addSql($this->backfillFromCard('inventory_items', 'is_foil'));
        $this->addSql('DROP INDEX uniq_inventory_store_card');
        $this->addSql('CREATE UNIQUE INDEX uniq_inventory_store_card ON inventory_items (store_id, card_id, condition, finish)');
        $this->addSql('ALTER TABLE inventory_items DROP is_foil');

        // --- what a store is buying ----------------------------------------
        $this->addSql("ALTER TABLE buylist_entries ADD wants_finish VARCHAR(40) DEFAULT 'Nonfoil' NOT NULL");
        $this->addSql($this->backfillFromCard('buylist_entries', 'wants_foil', 'wants_finish'));
        $this->addSql('DROP INDEX uniq_buylist_store_card_foil');
        $this->addSql('CREATE UNIQUE INDEX uniq_buylist_store_card_finish ON buylist_entries (store_id, card_id, wants_finish)');
        $this->addSql('ALTER TABLE buylist_entries DROP wants_foil');

        // --- what a customer sold / wants ----------------------------------
        // Both tables allow card_id NULL (free-form sells, free-text wants,
        // and the SET NULL FK), and the card join above skips those rows.
        // They still know which side of the axis they were on — without the
        // fallback a foil row would forget it was foil.
        $this->addSql("ALTER TABLE sell_submission_items ADD finish VARCHAR(40) DEFAULT 'Nonfoil' NOT NULL");
        $this->addSql($this->backfillFromCard('sell_submission_items', 'is_foil'));
        $this->addSql("UPDATE sell_submission_items SET finish = 'Foil' WHERE is_foil AND card_id IS NULL");
        $this->addSql('ALTER TABLE sell_submission_items DROP is_foil');

        $this->addSql("ALTER TABLE customer_want_list_entries ADD finish VARCHAR(40) DEFAULT 'Nonfoil' NOT NULL");
        $this->addSql($this->backfillFromCard('customer_want_list_entries', 'is_foil'));
        $this->addSql("UPDATE customer_want_list_entries SET finish = 'Foil' WHERE is_foil AND card_id IS NULL");
        $this->addSql('ALTER TABLE customer_want_list_entries DROP is_foil');

        // --- import rows ----------------------------------------------------
        // These record what a sheet said, not what a printing is. The generic
        // placeholder is the honest value: it is resolved against the matched
        // card when the row is actually imported.
        $this->addSql("ALTER TABLE csv_import_rows ADD finish VARCHAR(40) DEFAULT 'Nonfoil' NOT NULL");
        $this->addSql("UPDATE csv_import_rows SET finish = CASE WHEN is_foil THEN 'Foil' ELSE 'Nonfoil' END");
        $this->addSql('ALTER TABLE csv_import_rows DROP is_foil');
    }

    public function down(Schema $schema): void
    {
        foreach ([
            ['csv_import_rows', 'is_foil', 'finish'],
            ['customer_want_list_entries', 'is_foil', 'finish'],
            ['sell_submission_items', 'is_foil', 'finish'],
        ] as [$table, $boolean, $column]) {
            $this->addSql(sprintf('ALTER TABLE %s ADD %s BOOLEAN DEFAULT FALSE NOT NULL', $table, $boolean));
            $this->addSql($this->foldToBoolean($table, $boolean, $column));
            $this->addSql(sprintf('ALTER TABLE %s DROP %s', $table, $column));
        }

        // The buy list's uniqueness moves back onto the boolean, so two
        // treatments of one card on the same side must first be collapsed.
        $this->addSql('ALTER TABLE buylist_entries ADD wants_foil BOOLEAN DEFAULT FALSE NOT NULL');
        $this->addSql($this->foldToBoolean('buylist_entries', 'wants_foil', 'wants_finish'));
        $this->addSql('DROP INDEX uniq_buylist_store_card_finish');
        $this->addSql(<<<'SQL'
            DELETE FROM buylist_entries a
            USING buylist_entries b
            WHERE a.store_id = b.store_id AND a.card_id = b.card_id AND a.wants_foil = b.wants_foil AND a.id < b.id
            SQL);
        $this->addSql('CREATE UNIQUE INDEX uniq_buylist_store_card_foil ON buylist_entries (store_id, card_id, wants_foil)');
        $this->addSql('ALTER TABLE buylist_entries DROP wants_finish');

        $this->addSql('ALTER TABLE inventory_items ADD is_foil BOOLEAN DEFAULT FALSE NOT NULL');
        $this->addSql($this->foldToBoolean('inventory_items', 'is_foil', 'finish'));
        $this->addSql('DROP INDEX uniq_inventory_store_card');
        // Two treatments on the same side of the axis collapse into one row's
        // worth of identity, so the boolean index can only be rebuilt after
        // deduplicating; keep the highest-quantity line of each collision.
        $this->addSql(<<<'SQL'
            DELETE FROM inventory_items a
            USING inventory_items b
            WHERE a.store_id = b.store_id
              AND a.card_id = b.card_id
              AND a.condition = b.condition
              AND a.is_foil = b.is_foil
              AND (a.quantity, a.id) < (b.quantity, b.id)
            SQL);
        $this->addSql('CREATE UNIQUE INDEX uniq_inventory_store_card ON inventory_items (store_id, card_id, condition, is_foil)');
        $this->addSql('ALTER TABLE inventory_items DROP finish');
    }

    /**
     * Names each row's treatment using the game of the card it points at,
     * falling back to Magic's words for rows with no card or an unknown game.
     */
    private function backfillFromCard(string $table, string $boolean, string $column = 'finish'): string
    {
        $values = [];
        foreach (self::GAME_FINISHES as $code => [$plain, $foil]) {
            $values[] = sprintf("('%s', '%s', '%s')", $code, $plain, $foil);
        }

        return sprintf(
            <<<'SQL'
                UPDATE %1$s t
                SET %2$s = CASE
                    WHEN t.%3$s THEN COALESCE(v.foil, 'Foil')
                    ELSE COALESCE(v.plain, 'Nonfoil')
                END
                FROM cards c
                LEFT JOIN games g ON g.id = c.game_id
                LEFT JOIN (VALUES %4$s) AS v(code, plain, foil) ON v.code = COALESCE(g.code, 'mtg')
                WHERE c.id = t.card_id
                SQL,
            $table,
            $column,
            $boolean,
            implode(', ', $values),
        );
    }

    /** Any treatment naming a foil is foil; everything else is the plain printing. */
    private function foldToBoolean(string $table, string $boolean, string $column): string
    {
        return sprintf(
            "UPDATE %s SET %s = (lower(%s) NOT LIKE 'non%%' AND (lower(%s) LIKE '%%foil%%' OR lower(%s) LIKE '%%holo%%'))",
            $table,
            $boolean,
            $column,
            $column,
            $column,
        );
    }
}
