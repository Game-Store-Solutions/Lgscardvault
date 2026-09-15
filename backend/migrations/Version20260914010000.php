<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Pay-in-store Square invoices that appear on the seller's POS Invoices list. */
final class Version20260914010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add Square invoice id/url on orders for pay-in-store register collect';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders ADD square_invoice_id VARCHAR(191) DEFAULT NULL');
        $this->addSql('ALTER TABLE orders ADD square_invoice_url VARCHAR(1024) DEFAULT NULL');
        $this->addSql('CREATE UNIQUE INDEX uniq_order_square_invoice_id ON orders (square_invoice_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX uniq_order_square_invoice_id');
        $this->addSql('ALTER TABLE orders DROP square_invoice_id');
        $this->addSql('ALTER TABLE orders DROP square_invoice_url');
    }
}
