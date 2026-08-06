<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260806140000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Storefront hero banner layout option (cinematic, banner, spotlight, minimal).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE stores ADD hero_layout VARCHAR(32) DEFAULT 'cinematic' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP hero_layout');
    }
}
