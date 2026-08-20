<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260820010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Staff-facing notes on orders (e.g. paying in store)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders ADD notes VARCHAR(255) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders DROP notes');
    }
}
