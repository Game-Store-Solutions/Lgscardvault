<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260821150000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add dark hero banner image URL and vertical crop position for light and dark.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD dark_hero_image_url VARCHAR(1024) DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD hero_image_position SMALLINT DEFAULT 50 NOT NULL');
        $this->addSql('ALTER TABLE stores ADD dark_hero_image_position SMALLINT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP dark_hero_image_url');
        $this->addSql('ALTER TABLE stores DROP hero_image_position');
        $this->addSql('ALTER TABLE stores DROP dark_hero_image_position');
    }
}
