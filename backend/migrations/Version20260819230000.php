<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Promote Scryfall's `edhrec_rank` to a first-class indexed column on cards.
 *
 * The value already ships inside the raw scryfall_data payload; lifting it into
 * a dedicated integer column lets the commander deck builder order and filter
 * candidates by real-world playability (EDHREC rank, lower = more played) in
 * SQL — before the candidate cap — instead of after fetching the cheapest rows.
 */
final class Version20260819230000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add cards.edhrec_rank (indexed) and backfill from scryfall_data';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE cards ADD edhrec_rank INT DEFAULT NULL');
        $this->addSql('CREATE INDEX IDX_CARD_EDHREC_RANK ON cards (edhrec_rank)');

        // Backfill from the already-synced Scryfall payload. Only cast values
        // that are purely numeric so a malformed payload can't break the migration.
        $this->addSql(<<<'SQL'
            UPDATE cards
            SET edhrec_rank = (scryfall_data->>'edhrec_rank')::int
            WHERE scryfall_data->>'edhrec_rank' ~ '^[0-9]+$'
            SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX IDX_CARD_EDHREC_RANK');
        $this->addSql('ALTER TABLE cards DROP edhrec_rank');
    }
}
