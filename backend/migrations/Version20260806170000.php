<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260806170000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Collapse hero_layout to five curated styles (cinematic, living-inventory, trading-table, event-board, floating-cards).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            UPDATE stores SET hero_layout = CASE hero_layout
                WHEN 'floating-collection' THEN 'floating-cards'
                WHEN 'trading-desk' THEN 'trading-table'
                WHEN 'collection' THEN 'living-inventory'
                WHEN 'library-shelf' THEN 'living-inventory'
                WHEN 'shipping-station' THEN 'living-inventory'
                WHEN 'mosaic-hero' THEN 'living-inventory'
                WHEN 'planeswalkers-desk' THEN 'trading-table'
                WHEN 'trading-table' THEN 'trading-table'
                WHEN 'event-board' THEN 'event-board'
                WHEN 'living-inventory' THEN 'living-inventory'
                WHEN 'floating-cards' THEN 'floating-cards'
                WHEN 'cinematic' THEN 'cinematic'
                ELSE 'cinematic'
            END
            SQL);

        $this->addSql("ALTER TABLE stores ALTER COLUMN hero_layout SET DEFAULT 'cinematic'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE stores ALTER COLUMN hero_layout SET DEFAULT 'store-story-hero'");
    }
}
