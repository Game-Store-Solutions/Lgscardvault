<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260821140000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add light and dark hero banner image opacity (0–100).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD hero_image_opacity SMALLINT DEFAULT 100 NOT NULL');
        $this->addSql('ALTER TABLE stores ADD dark_hero_image_opacity SMALLINT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP hero_image_opacity');
        $this->addSql('ALTER TABLE stores DROP dark_hero_image_opacity');
    }
}
