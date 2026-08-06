<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260806210000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add archived_at to sell_submissions for staff archive workflow.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE sell_submissions ADD archived_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql("UPDATE sell_submissions SET archived_at = COALESCE(decided_at, created_at) WHERE status IN ('completed', 'declined') AND archived_at IS NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE sell_submissions DROP archived_at');
    }
}
