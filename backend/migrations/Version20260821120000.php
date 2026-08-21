<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260821120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add dark-mode storefront frame styles (thickness, glow, blur).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD dark_frame_styles JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP dark_frame_styles');
    }
}
