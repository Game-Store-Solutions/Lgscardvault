<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * COGS foundation: what the store paid per copy. Tracked on the listing
 * (inventory_items.acquisition_cost_cents, owner-entered) and snapshotted
 * per-unit onto order lines at sale time so profit reporting survives
 * repricing and listing deletion. Null = cost not tracked.
 */
final class Version20260727090000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add acquisition_cost_cents to inventory_items and order_lines (COGS)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE inventory_items ADD acquisition_cost_cents INT DEFAULT NULL');
        $this->addSql('ALTER TABLE order_lines ADD acquisition_cost_cents INT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE inventory_items DROP acquisition_cost_cents');
        $this->addSql('ALTER TABLE order_lines DROP acquisition_cost_cents');
    }
}
