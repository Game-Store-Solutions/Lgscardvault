<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Heartbeat for catalog sync runs. A worker killed mid-sync (out of memory,
 * restart) cannot record its own failure, leaving the run stuck at RUNNING;
 * a heartbeat lets the app tell a live long sync apart from a dead one and
 * close out the dead ones.
 *
 * Existing RUNNING rows have no heartbeat, so they fall back to started_at
 * and are reaped on the next read — which is the desired outcome for runs
 * already orphaned before this deploy.
 */
final class Version20260728040000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'catalog_sync_runs.heartbeat_at for detecting interrupted syncs';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE catalog_sync_runs ADD heartbeat_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql('CREATE INDEX idx_catalog_sync_running ON catalog_sync_runs (status, heartbeat_at)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX idx_catalog_sync_running');
        $this->addSql('ALTER TABLE catalog_sync_runs DROP heartbeat_at');
    }
}
