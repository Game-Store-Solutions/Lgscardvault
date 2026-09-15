<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** When staff accept or decline a pending order, stamp the decision time. */
final class Version20260914020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add status_changed_at on orders for accept/decline timestamps';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders ADD status_changed_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders DROP status_changed_at');
    }
}
