<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260823060000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Record Global Privacy Control on privacy requests.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE privacy_requests ADD gpc_signal BOOLEAN DEFAULT false NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE privacy_requests DROP gpc_signal');
    }
}
