<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260828020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Newsletter campaigns and subscriber unsubscribe tokens';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE newsletter_campaigns (id SERIAL NOT NULL, subject VARCHAR(160) NOT NULL, preheader VARCHAR(200) DEFAULT NULL, body TEXT NOT NULL, status VARCHAR(16) NOT NULL, sent_count INT NOT NULL, failed_count INT NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, updated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, sent_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, last_error TEXT DEFAULT NULL, PRIMARY KEY(id))');
        $this->addSql("ALTER TABLE newsletter_subscribers ADD unsubscribe_token VARCHAR(64) DEFAULT '' NOT NULL");
        $this->addSql('ALTER TABLE newsletter_subscribers ADD unsubscribed_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql("UPDATE newsletter_subscribers SET unsubscribe_token = md5(random()::text || clock_timestamp()::text || email) WHERE unsubscribe_token = ''");
        $this->addSql('CREATE UNIQUE INDEX uniq_newsletter_unsubscribe_token ON newsletter_subscribers (unsubscribe_token)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE newsletter_campaigns');
        $this->addSql('DROP INDEX uniq_newsletter_unsubscribe_token');
        $this->addSql('ALTER TABLE newsletter_subscribers DROP unsubscribe_token');
        $this->addSql('ALTER TABLE newsletter_subscribers DROP unsubscribed_at');
    }
}
