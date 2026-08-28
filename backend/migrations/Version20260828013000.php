<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260828013000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add newsletter_subscribers table for landing-page signups';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE newsletter_subscribers (id SERIAL NOT NULL, email VARCHAR(180) NOT NULL, source VARCHAR(32) DEFAULT NULL, subscribed_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL, PRIMARY KEY(id))');
        $this->addSql('CREATE UNIQUE INDEX uniq_newsletter_email ON newsletter_subscribers (email)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE newsletter_subscribers');
    }
}
