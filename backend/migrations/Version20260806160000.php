<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260806160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Replace legacy hero_layout values with signature LGS hero layouts; default store-story-hero.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            UPDATE stores SET hero_layout = CASE hero_layout
                WHEN 'storefront' THEN 'store-story-hero'
                WHEN 'featured-card' THEN 'gallery-wall'
                WHEN 'collection' THEN 'open-binder'
                WHEN 'full-art' THEN 'gallery-wall'
                WHEN 'trading-desk' THEN 'trading-table'
                WHEN 'floating-cards' THEN 'floating-collection'
                WHEN 'mascot' THEN 'convention-booth'
                WHEN 'dynamic' THEN 'day-night-hero'
                WHEN 'video' THEN 'convention-booth'
                WHEN 'minimal' THEN 'store-counter'
                WHEN 'cinematic' THEN 'store-window'
                WHEN 'banner' THEN 'store-counter'
                WHEN 'spotlight' THEN 'convention-booth'
                ELSE hero_layout
            END
            SQL);

        $this->addSql("ALTER TABLE stores ALTER COLUMN hero_layout SET DEFAULT 'store-story-hero'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            UPDATE stores SET hero_layout = CASE hero_layout
                WHEN 'store-story-hero' THEN 'storefront'
                WHEN 'collectors-shelf' THEN 'storefront'
                WHEN 'open-binder' THEN 'collection'
                WHEN 'trading-table' THEN 'trading-desk'
                WHEN 'store-counter' THEN 'storefront'
                WHEN 'planeswalkers-desk' THEN 'trading-desk'
                WHEN 'shipping-station' THEN 'storefront'
                WHEN 'trophy-wall' THEN 'storefront'
                WHEN 'convention-booth' THEN 'mascot'
                WHEN 'floating-collection' THEN 'floating-cards'
                WHEN 'library-shelf' THEN 'collection'
                WHEN 'world-map' THEN 'storefront'
                WHEN 'living-inventory' THEN 'floating-cards'
                WHEN 'gallery-wall' THEN 'featured-card'
                WHEN 'vault' THEN 'full-art'
                WHEN 'command-center' THEN 'dynamic'
                WHEN 'guild-hall' THEN 'storefront'
                WHEN 'event-board' THEN 'banner'
                WHEN 'mosaic-hero' THEN 'collection'
                WHEN 'store-window' THEN 'cinematic'
                WHEN 'day-night-hero' THEN 'dynamic'
                ELSE 'storefront'
            END
            SQL);

        $this->addSql("ALTER TABLE stores ALTER COLUMN hero_layout SET DEFAULT 'storefront'");
    }
}
