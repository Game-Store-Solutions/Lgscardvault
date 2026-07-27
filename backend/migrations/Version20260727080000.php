<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Order channel: where an order originated — the online storefront or an
 * in-store kiosk terminal. Existing orders backfill to 'online'.
 */
final class Version20260727080000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return "Add orders.channel (online|kiosk, default 'online')";
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE orders ADD channel VARCHAR(16) DEFAULT 'online' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders DROP channel');
    }
}
