<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260826040000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Track platform fee progress for pay-as-you-sell billing';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD platform_fees_paid_cents INT DEFAULT 0 NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP platform_fees_paid_cents');
    }
}
