<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260908200000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Bumpable kiosk session epoch so exit invalidates outstanding kiosk tokens.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD kiosk_session_epoch INT DEFAULT 0 NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP kiosk_session_epoch');
    }
}
