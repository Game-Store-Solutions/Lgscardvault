<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Phase 1 storefront templates: Vault (boxed default), Campaign, Studio.
 */
final class Version20260919200000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add stores.storefront_template (vault | campaign | studio) for opt-in home shells';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE stores ADD storefront_template VARCHAR(32) DEFAULT 'vault' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP storefront_template');
    }
}
