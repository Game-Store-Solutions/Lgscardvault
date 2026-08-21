<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260821130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add storefront page background presets for light and dark themes.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD page_backgrounds JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP page_backgrounds');
    }
}
