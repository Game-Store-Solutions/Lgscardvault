<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260816150000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Email verification flag and one-time hashed verify tokens';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE users ADD email_verified BOOLEAN DEFAULT true NOT NULL');
        $this->addSql('ALTER TABLE users ADD email_verify_token VARCHAR(64) DEFAULT NULL');
        $this->addSql('ALTER TABLE users ADD email_verify_expires_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql('CREATE INDEX idx_user_email_verify_token ON users (email_verify_token)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX idx_user_email_verify_token');
        $this->addSql('ALTER TABLE users DROP email_verified');
        $this->addSql('ALTER TABLE users DROP email_verify_token');
        $this->addSql('ALTER TABLE users DROP email_verify_expires_at');
    }
}
