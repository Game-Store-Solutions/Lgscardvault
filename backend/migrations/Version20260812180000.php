<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260812180000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add scryfall_sync_runs for Sync Jobs history.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE scryfall_sync_runs (id SERIAL NOT NULL, bulk_type VARCHAR(32) NOT NULL, status VARCHAR(16) DEFAULT \'queued\' NOT NULL, started_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, heartbeat_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, finished_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, summary JSON DEFAULT NULL, error TEXT DEFAULT NULL, PRIMARY KEY(id))');
        $this->addSql('CREATE INDEX idx_scryfall_sync_started ON scryfall_sync_runs (started_at)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE scryfall_sync_runs');
    }
}
