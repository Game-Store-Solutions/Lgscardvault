<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Per-section card capacity: store_sections.card_limit caps how many distinct
 * cards auto-fill pulls (and manual adds accept) for the section. Null keeps
 * the platform default (60).
 */
final class Version20260727070000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add store_sections.card_limit (per-section card capacity)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_sections ADD card_limit INT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_sections DROP card_limit');
    }
}
