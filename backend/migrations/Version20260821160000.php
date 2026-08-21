<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260821160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add horizontal and mobile hero banner crop positions.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD hero_image_position_x SMALLINT DEFAULT 50 NOT NULL');
        $this->addSql('ALTER TABLE stores ADD dark_hero_image_position_x SMALLINT DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD hero_image_position_mobile_x SMALLINT DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD hero_image_position_mobile_y SMALLINT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP hero_image_position_x');
        $this->addSql('ALTER TABLE stores DROP dark_hero_image_position_x');
        $this->addSql('ALTER TABLE stores DROP hero_image_position_mobile_x');
        $this->addSql('ALTER TABLE stores DROP hero_image_position_mobile_y');
    }
}
