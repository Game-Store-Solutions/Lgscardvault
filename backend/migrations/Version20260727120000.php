<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Per-store dark-mode branding: stores.dark_colors holds an optional palette
 * (same seven keys as the base branding colors) used when the shopper's
 * theme is dark. Null keeps the existing derive-from-base behavior.
 */
final class Version20260727120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add stores.dark_colors (per-store dark-mode palette)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD dark_colors JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP dark_colors');
    }
}
