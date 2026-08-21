<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260821170000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add spotlight carousel min/max item counts and pinned inventory ids.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD spotlight_min_items SMALLINT DEFAULT 4 NOT NULL');
        $this->addSql('ALTER TABLE stores ADD spotlight_max_items SMALLINT DEFAULT 12 NOT NULL');
        $this->addSql("ALTER TABLE stores ADD spotlight_pinned_inventory_ids JSON DEFAULT '[]' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP spotlight_min_items');
        $this->addSql('ALTER TABLE stores DROP spotlight_max_items');
        $this->addSql('ALTER TABLE stores DROP spotlight_pinned_inventory_ids');
    }
}
