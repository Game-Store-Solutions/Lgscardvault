<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260908020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Track monthly billing warning emails sent for 7/3/1 day thresholds.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores ADD billing_warning_7_sent_for DATE DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD billing_warning_3_sent_for DATE DEFAULT NULL');
        $this->addSql('ALTER TABLE stores ADD billing_warning_1_sent_for DATE DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE stores DROP billing_warning_1_sent_for');
        $this->addSql('ALTER TABLE stores DROP billing_warning_3_sent_for');
        $this->addSql('ALTER TABLE stores DROP billing_warning_7_sent_for');
    }
}
