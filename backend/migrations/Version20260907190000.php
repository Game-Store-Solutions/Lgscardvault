<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260907190000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Owner-managed marketplace listing and storefront feature flags.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD is_listed BOOLEAN DEFAULT true NOT NULL');
        $this->addSql("ALTER TABLE stores ADD features JSON DEFAULT '{}' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP features');
        $this->addSql('ALTER TABLE stores DROP is_listed');
    }
}
