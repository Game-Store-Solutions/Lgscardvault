<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260821010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add storefront border glow branding field.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD border_glow SMALLINT DEFAULT 0 NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP border_glow');
    }
}
