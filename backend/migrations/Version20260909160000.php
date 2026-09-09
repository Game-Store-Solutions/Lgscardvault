<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Speed up import-run set search / distinct-set typeahead on large jobs.
 */
final class Version20260909160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Index csv_import_rows for set filter and distinct-set lookups';
    }

    public function up(Schema $schema): void
    {
        // Prefix search uses LOWER(set_code) LIKE 'eve%' — text_pattern_ops
        // lets Postgres use the index for that pattern.
        $this->addSql('CREATE INDEX IDX_CSV_IMPORT_ROWS_JOB_STATUS_SET_LOWER ON csv_import_rows (job_id, status, LOWER(set_code) text_pattern_ops)');
        $this->addSql('CREATE INDEX IDX_CSV_IMPORT_ROWS_JOB_SET ON csv_import_rows (job_id, set_code)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX IDX_CSV_IMPORT_ROWS_JOB_STATUS_SET_LOWER');
        $this->addSql('DROP INDEX IDX_CSV_IMPORT_ROWS_JOB_SET');
    }
}
