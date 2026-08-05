<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Real card checkout needs to record what the store's processor actually
 * captured, separately from the merchandise total: store credit can cover part
 * (or all) of an order, and refunds have to target the exact captured amount.
 */
final class Version20260805020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Track captured amount and processor payment reference on orders';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders ADD paid_cents INT DEFAULT 0 NOT NULL');
        $this->addSql('ALTER TABLE orders ADD payment_reference VARCHAR(128) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE orders DROP payment_reference');
        $this->addSql('ALTER TABLE orders DROP paid_cents');
    }
}
