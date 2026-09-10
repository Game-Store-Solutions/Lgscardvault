<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Persist in-progress sell/trade lists on the store customer profile.
 */
final class Version20260910010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add sell_trade_draft JSON column on store_customers';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_customers ADD sell_trade_draft JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_customers DROP sell_trade_draft');
    }
}
