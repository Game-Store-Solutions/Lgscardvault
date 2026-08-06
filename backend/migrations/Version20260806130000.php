<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260806130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Marketplace-wide shopper payment profile on users (synced to store customer rows).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE users ADD payment_brand VARCHAR(40) DEFAULT NULL');
        $this->addSql('ALTER TABLE users ADD payment_last4 VARCHAR(4) DEFAULT NULL');
        $this->addSql('ALTER TABLE users ADD payment_expires VARCHAR(7) DEFAULT NULL');
        $this->addSql('ALTER TABLE users ADD payment_method_type VARCHAR(32) DEFAULT NULL');
        $this->addSql('ALTER TABLE users ADD payment_customer_id VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE users ADD payment_card_id VARCHAR(255) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE users DROP payment_brand');
        $this->addSql('ALTER TABLE users DROP payment_last4');
        $this->addSql('ALTER TABLE users DROP payment_expires');
        $this->addSql('ALTER TABLE users DROP payment_method_type');
        $this->addSql('ALTER TABLE users DROP payment_customer_id');
        $this->addSql('ALTER TABLE users DROP payment_card_id');
    }
}
