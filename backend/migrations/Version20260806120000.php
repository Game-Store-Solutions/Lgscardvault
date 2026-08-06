<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260806120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Vault shopper payment methods on the store Square account (customer profile).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_customers ADD payment_customer_id VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE store_customers ADD payment_card_id VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE store_customers ADD payment_method_type VARCHAR(32) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_customers DROP payment_customer_id');
        $this->addSql('ALTER TABLE store_customers DROP payment_card_id');
        $this->addSql('ALTER TABLE store_customers DROP payment_method_type');
    }
}
