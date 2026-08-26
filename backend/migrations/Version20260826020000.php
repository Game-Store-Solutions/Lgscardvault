<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260826020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Track PayPal/Square captures on orders so line-edit refunds and extras can settle in one go.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE orders ADD payment_captures JSON DEFAULT '[]' NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders DROP payment_captures');
    }
}
