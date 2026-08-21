<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260821020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add per-piece storefront frame styles (hero, tile, card).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD frame_styles JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP frame_styles');
    }
}
