<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * User profile image: users.avatar_url (hosted URL; null = initials avatar).
 */
final class Version20260727100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add users.avatar_url';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE users ADD avatar_url VARCHAR(1024) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE users DROP avatar_url');
    }
}
