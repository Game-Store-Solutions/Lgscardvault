<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260806150000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Expand storefront hero_layout choices; default storefront for new column semantics.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("UPDATE stores SET hero_layout = 'mascot' WHERE hero_layout = 'spotlight'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("UPDATE stores SET hero_layout = 'spotlight' WHERE hero_layout = 'mascot'");
    }
}
