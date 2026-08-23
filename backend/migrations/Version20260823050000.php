<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260823050000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Persist merchant-terms acceptance timestamp on stores.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD merchant_terms_accepted_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP merchant_terms_accepted_at');
    }
}
