<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260804193000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Vault Braintree customer id on stores for subscription billing and payment updates';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD braintree_customer_id VARCHAR(64) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP braintree_customer_id');
    }
}
