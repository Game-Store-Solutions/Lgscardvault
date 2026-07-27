<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Sell/Trade v2: per-store payout rates (percent of market, with promo
 * window and buy-list premium), free-form sell submissions with payout
 * method + kiosk channel + market snapshots, per-line condition and staff
 * accepted quantities, and buy-list entries that can be rate-based
 * (offer_cents NULL) or hidden (active).
 */
final class Version20260727140000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Sell/trade v2: store trade rates, payout method/channel/market snapshots on submissions, conditions + accepted quantities on lines, rate-based + inactive buylist entries';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD trade_rates JSON DEFAULT NULL');

        $this->addSql("ALTER TABLE sell_submissions ADD total_market_cents INT DEFAULT 0 NOT NULL");
        $this->addSql("ALTER TABLE sell_submissions ADD payout_method VARCHAR(8) DEFAULT 'cash' NOT NULL");
        $this->addSql("ALTER TABLE sell_submissions ADD channel VARCHAR(8) DEFAULT 'online' NOT NULL");
        $this->addSql('ALTER TABLE sell_submissions ADD kiosk_customer_name VARCHAR(120) DEFAULT NULL');

        $this->addSql('ALTER TABLE sell_submission_items ADD market_price_cents INT DEFAULT 0 NOT NULL');
        $this->addSql("ALTER TABLE sell_submission_items ADD condition VARCHAR(255) DEFAULT 'NM' NOT NULL");
        $this->addSql('ALTER TABLE sell_submission_items ADD is_from_buylist BOOLEAN DEFAULT false NOT NULL');
        $this->addSql('ALTER TABLE sell_submission_items ADD accepted_quantity INT DEFAULT NULL');

        $this->addSql('ALTER TABLE buylist_entries ALTER offer_cents DROP NOT NULL');
        $this->addSql('ALTER TABLE buylist_entries ADD active BOOLEAN DEFAULT true NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP trade_rates');
        $this->addSql('ALTER TABLE sell_submissions DROP total_market_cents');
        $this->addSql('ALTER TABLE sell_submissions DROP payout_method');
        $this->addSql('ALTER TABLE sell_submissions DROP channel');
        $this->addSql('ALTER TABLE sell_submissions DROP kiosk_customer_name');
        $this->addSql('ALTER TABLE sell_submission_items DROP market_price_cents');
        $this->addSql('ALTER TABLE sell_submission_items DROP condition');
        $this->addSql('ALTER TABLE sell_submission_items DROP is_from_buylist');
        $this->addSql('ALTER TABLE sell_submission_items DROP accepted_quantity');
        $this->addSql('ALTER TABLE buylist_entries ALTER offer_cents SET NOT NULL');
        $this->addSql('ALTER TABLE buylist_entries DROP active');
    }
}
