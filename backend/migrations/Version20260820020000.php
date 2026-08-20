<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Promote artist credits (top-level + per-face) to an indexed JSONB column.
 *
 * Storefront artist pages previously filtered inventory with
 * LOWER(CAST(scryfall_data AS TEXT)) LIKE '%"artist": "…"%'. That expression
 * cannot use an index and stringifies every card's full Scryfall payload
 * (tens of KB) for every in-stock listing — the reason those pages felt
 * like they would never load.
 *
 * artist_credits is a tiny JSONB array of lowercase names. GIN `@>` looks
 * up the handful of matching printings directly.
 */
final class Version20260820020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add cards.artist_credits (jsonb, GIN) and backfill from artist + card_faces';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE cards ADD artist_credits JSONB DEFAULT NULL');

        // Extract unique lowercase credits from the column plus each face.
        // json_array_elements only walks card_faces — never the rest of the blob.
        $this->addSql(<<<'SQL'
            UPDATE cards AS c
            SET artist_credits = src.credits
            FROM (
                SELECT
                    inner_c.id,
                    (
                        SELECT jsonb_agg(DISTINCT lower(btrim(name)))
                        FROM (
                            SELECT inner_c.artist AS name
                            UNION ALL
                            SELECT face->>'artist'
                            FROM json_array_elements(
                                CASE
                                    WHEN json_typeof(inner_c.scryfall_data -> 'card_faces') = 'array'
                                        THEN inner_c.scryfall_data -> 'card_faces'
                                    ELSE '[]'::json
                                END
                            ) AS face
                        ) AS names(name)
                        WHERE name IS NOT NULL AND btrim(name) <> ''
                    ) AS credits
                FROM cards AS inner_c
            ) AS src
            WHERE c.id = src.id
            SQL);

        $this->addSql('CREATE INDEX idx_card_artist_credits ON cards USING gin (artist_credits)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX idx_card_artist_credits');
        $this->addSql('ALTER TABLE cards DROP artist_credits');
    }
}
