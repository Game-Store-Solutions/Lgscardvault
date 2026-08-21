<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260820220000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add storefront border thickness and surface blur branding fields.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD border_thickness SMALLINT DEFAULT 1 NOT NULL');
        $this->addSql('ALTER TABLE stores ADD surface_blur SMALLINT DEFAULT 12 NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP border_thickness');
        $this->addSql('ALTER TABLE stores DROP surface_blur');
    }
}
