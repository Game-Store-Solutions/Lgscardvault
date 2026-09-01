<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260831090000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Track daily shopper sales for usage-plan platform fee settlement at midnight';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE platform_daily_sales_ledgers (
            id SERIAL NOT NULL,
            store_id INT NOT NULL,
            business_date DATE NOT NULL,
            gross_cents INT DEFAULT 0 NOT NULL,
            fee_settled_cents INT DEFAULT 0 NOT NULL,
            settled_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            settlement_reference VARCHAR(128) DEFAULT NULL,
            settlement_error TEXT DEFAULT NULL,
            settlement_attempts INT DEFAULT 0 NOT NULL,
            PRIMARY KEY(id)
        )');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_PLATFORM_DAILY_SALES_STORE_DATE ON platform_daily_sales_ledgers (store_id, business_date)');
        $this->addSql('CREATE INDEX IDX_PLATFORM_DAILY_SALES_SETTLED ON platform_daily_sales_ledgers (settled_at, business_date)');
        $this->addSql('ALTER TABLE platform_daily_sales_ledgers ADD CONSTRAINT FK_PLATFORM_DAILY_SALES_STORE FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE platform_daily_sales_ledgers DROP CONSTRAINT FK_PLATFORM_DAILY_SALES_STORE');
        $this->addSql('DROP TABLE platform_daily_sales_ledgers');
    }
}
