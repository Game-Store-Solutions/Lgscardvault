<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260907010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Let shoppers customize the account profile cover image and tint.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE users ADD cover_image_url VARCHAR(1024) DEFAULT NULL');
        $this->addSql('ALTER TABLE users ADD cover_color VARCHAR(7) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE users DROP cover_image_url');
        $this->addSql('ALTER TABLE users DROP cover_color');
    }
}
