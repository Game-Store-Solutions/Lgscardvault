<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260826030000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Track last balance-due email amount for guest shoppers';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders ADD balance_due_notified_cents INT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders DROP balance_due_notified_cents');
    }
}
