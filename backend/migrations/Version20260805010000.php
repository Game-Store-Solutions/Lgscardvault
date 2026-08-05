<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Platform subscriptions moved from Braintree to Square, so the vault columns
 * lose their provider-specific name. Square needs a card id alongside the
 * customer id: renewals charge a specific card on file, not "the customer".
 */
final class Version20260805010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Provider-agnostic subscription vault columns (Square customer + card on file)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores RENAME COLUMN braintree_customer_id TO payment_customer_id');
        $this->addSql('ALTER TABLE stores ADD payment_card_id VARCHAR(64) DEFAULT NULL');

        // Braintree vault references are meaningless to Square; clear them so a
        // stale id can never be charged, and mark those stores for re-entry.
        $this->addSql("UPDATE stores SET payment_customer_id = NULL, payment_reference = NULL, subscription_status = 'payment_required' WHERE payment_customer_id IS NOT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP payment_card_id');
        $this->addSql('ALTER TABLE stores RENAME COLUMN payment_customer_id TO braintree_customer_id');
    }
}
