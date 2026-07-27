<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Stocking sheet for case cards: store_section_cards.stocked_at records when
 * staff physically placed a card in the display case. Null means the row was
 * added or topped up (by auto-fill or a manual add) and still needs pulling
 * from stock. Existing rows are grandfathered as already stocked so live
 * cases don't suddenly report their whole pool as unplaced.
 */
final class Version20260727060000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add store_section_cards.stocked_at (stocking sheet), backfill existing rows as stocked';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_section_cards ADD stocked_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql('UPDATE store_section_cards SET stocked_at = NOW()');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_section_cards DROP stocked_at');
    }
}
