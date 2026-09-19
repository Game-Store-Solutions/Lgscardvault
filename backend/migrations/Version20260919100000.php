<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Distinguish hand-picked case cards from auto-fill so a re-pull can clear
 * previously pulled listings without sweeping cards the owner added by hand.
 */
final class Version20260919100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add store_section_cards.added_manually so auto-fill preserves hand-picked cards';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_section_cards ADD added_manually BOOLEAN DEFAULT false NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE store_section_cards DROP added_manually');
    }
}
