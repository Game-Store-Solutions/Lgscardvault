<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Game-aware imports (jobs carry a game + import type, rows carry a price)
 * and sealed checkout (cart lines and order lines can reference a sealed
 * listing). Existing singles carts/orders are untouched: their sealed
 * columns stay NULL, and inventory_item_id only becomes nullable.
 */
final class Version20260728030000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'CSV import jobs gain game + type; cart and order lines gain sealed listings';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE csv_import_jobs ADD game_id INT DEFAULT NULL');
        $this->addSql("ALTER TABLE csv_import_jobs ADD import_type VARCHAR(16) DEFAULT 'cards' NOT NULL");
        $this->addSql('ALTER TABLE csv_import_jobs ADD CONSTRAINT FK_CSV_JOB_GAME FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE SET NULL NOT DEFERRABLE INITIALLY IMMEDIATE');
        $this->addSql('CREATE INDEX IDX_CSV_JOB_GAME ON csv_import_jobs (game_id)');

        $this->addSql('ALTER TABLE csv_import_rows ADD price_cents INT DEFAULT NULL');

        // Sealed cart lines: exactly one of the two listing columns is set,
        // so the singles column becomes nullable.
        $this->addSql('ALTER TABLE cart_items ALTER inventory_item_id DROP NOT NULL');
        $this->addSql('ALTER TABLE cart_items ADD sealed_inventory_item_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE cart_items ADD CONSTRAINT FK_CART_SEALED_ITEM FOREIGN KEY (sealed_inventory_item_id) REFERENCES sealed_inventory_items (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE');
        $this->addSql('CREATE UNIQUE INDEX uniq_cart_customer_sealed ON cart_items (customer_id, sealed_inventory_item_id)');

        $this->addSql('ALTER TABLE order_lines ADD sealed_product_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE order_lines ADD sealed_inventory_item_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE order_lines ADD CONSTRAINT FK_ORDER_LINE_SEALED_PRODUCT FOREIGN KEY (sealed_product_id) REFERENCES sealed_products (id) ON DELETE SET NULL NOT DEFERRABLE INITIALLY IMMEDIATE');
        $this->addSql('ALTER TABLE order_lines ADD CONSTRAINT FK_ORDER_LINE_SEALED_ITEM FOREIGN KEY (sealed_inventory_item_id) REFERENCES sealed_inventory_items (id) ON DELETE SET NULL NOT DEFERRABLE INITIALLY IMMEDIATE');
        $this->addSql('CREATE INDEX IDX_ORDER_LINE_SEALED_PRODUCT ON order_lines (sealed_product_id)');
        $this->addSql('CREATE INDEX IDX_ORDER_LINE_SEALED_ITEM ON order_lines (sealed_inventory_item_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE order_lines DROP CONSTRAINT FK_ORDER_LINE_SEALED_PRODUCT');
        $this->addSql('ALTER TABLE order_lines DROP CONSTRAINT FK_ORDER_LINE_SEALED_ITEM');
        $this->addSql('DROP INDEX IDX_ORDER_LINE_SEALED_PRODUCT');
        $this->addSql('DROP INDEX IDX_ORDER_LINE_SEALED_ITEM');
        $this->addSql('ALTER TABLE order_lines DROP sealed_product_id');
        $this->addSql('ALTER TABLE order_lines DROP sealed_inventory_item_id');

        $this->addSql('DROP INDEX uniq_cart_customer_sealed');
        $this->addSql('ALTER TABLE cart_items DROP CONSTRAINT FK_CART_SEALED_ITEM');
        $this->addSql('DELETE FROM cart_items WHERE inventory_item_id IS NULL');
        $this->addSql('ALTER TABLE cart_items DROP sealed_inventory_item_id');
        $this->addSql('ALTER TABLE cart_items ALTER inventory_item_id SET NOT NULL');

        $this->addSql('ALTER TABLE csv_import_rows DROP price_cents');
        $this->addSql('ALTER TABLE csv_import_jobs DROP CONSTRAINT FK_CSV_JOB_GAME');
        $this->addSql('DROP INDEX IDX_CSV_JOB_GAME');
        $this->addSql('ALTER TABLE csv_import_jobs DROP game_id');
        $this->addSql('ALTER TABLE csv_import_jobs DROP import_type');
    }
}
