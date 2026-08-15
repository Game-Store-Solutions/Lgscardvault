<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260814040000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add square_order_id to orders for itemized Square Orders API linkage';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders ADD square_order_id VARCHAR(128) DEFAULT NULL');
        $this->addSql('CREATE INDEX IDX_ORDER_SQUARE_ORDER ON orders (square_order_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX IDX_ORDER_SQUARE_ORDER ON orders');
        $this->addSql('ALTER TABLE orders DROP square_order_id');
    }
}
