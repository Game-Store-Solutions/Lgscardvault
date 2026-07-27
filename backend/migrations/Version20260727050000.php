<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Order fulfillment method: 'pickup' (in-store, the default) or 'shipping'.
 * Existing orders backfill to 'pickup' via the column default.
 */
final class Version20260727050000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return "Add orders.fulfillment (pickup|shipping, default 'pickup')";
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE orders ADD fulfillment VARCHAR(16) DEFAULT 'pickup' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders DROP fulfillment');
    }
}
