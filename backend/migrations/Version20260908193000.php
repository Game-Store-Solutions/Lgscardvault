<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260908193000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Store hashed kiosk exit code so staff can leave locked customer terminals.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD kiosk_exit_code_hash VARCHAR(255) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP kiosk_exit_code_hash');
    }
}
