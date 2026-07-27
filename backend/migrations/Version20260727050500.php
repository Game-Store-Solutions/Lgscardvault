<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Storefront footer fields on stores: freeform opening hours, public contact
 * email, website, and social links (all owner-managed via /settings).
 */
final class Version20260727050500 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add store footer fields: hours_text, contact_email, website/social URLs';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD hours_text TEXT DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD contact_email VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD website_url VARCHAR(1024) DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD facebook_url VARCHAR(1024) DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD instagram_url VARCHAR(1024) DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD twitter_url VARCHAR(1024) DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD discord_url VARCHAR(1024) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP hours_text');
        $this->addSql('ALTER TABLE stores DROP contact_email');
        $this->addSql('ALTER TABLE stores DROP website_url');
        $this->addSql('ALTER TABLE stores DROP facebook_url');
        $this->addSql('ALTER TABLE stores DROP instagram_url');
        $this->addSql('ALTER TABLE stores DROP twitter_url');
        $this->addSql('ALTER TABLE stores DROP discord_url');
    }
}
