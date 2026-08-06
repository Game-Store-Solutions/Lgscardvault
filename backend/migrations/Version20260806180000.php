<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260806180000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add community_events JSON for storefront event board and calendar page.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD community_events JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP community_events');
    }
}
