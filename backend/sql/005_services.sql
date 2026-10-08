-- =============================================================================
-- LedgerCore :: 005_services.sql
-- General-services errands and shopping lists (no asset-register access).
-- =============================================================================

CREATE TABLE IF NOT EXISTS errands (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id            INT UNSIGNED NOT NULL,
  errand_no         VARCHAR(20)  NOT NULL,
  title             VARCHAR(200) NOT NULL,
  description       VARCHAR(800) NULL,
  kind              ENUM('purchase_run','fleet','it_hardware','electrical','network','general') NOT NULL DEFAULT 'general',
  priority          ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status            ENUM('requested','assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'requested',
  due_date          DATE         NULL,
  location_note     VARCHAR(200) NULL,
  vehicle_note      VARCHAR(200) NULL,
  cost_center_id    INT UNSIGNED NULL,
  requested_by      INT UNSIGNED NULL,
  assigned_to       INT UNSIGNED NULL,
  completed_at      DATETIME     NULL,
  completion_note   VARCHAR(500) NULL,
  shopping_list_id  INT UNSIGNED NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_errand_no (org_id, errand_no),
  KEY ix_errand_status (org_id, status, due_date),
  KEY ix_errand_assignee (assigned_to, status),
  CONSTRAINT fk_errand_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_errand_cc  FOREIGN KEY (cost_center_id) REFERENCES cost_centers (id) ON DELETE SET NULL,
  CONSTRAINT fk_errand_req FOREIGN KEY (requested_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_errand_asg FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shopping_lists (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id         INT UNSIGNED NOT NULL,
  list_no        VARCHAR(20)  NOT NULL,
  title          VARCHAR(200) NOT NULL,
  notes          VARCHAR(500) NULL,
  status         ENUM('open','shopping','received','cancelled') NOT NULL DEFAULT 'open',
  needed_by      DATE         NULL,
  destination    VARCHAR(200) NULL,
  requested_by   INT UNSIGNED NULL,
  assigned_to    INT UNSIGNED NULL,
  errand_id      INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_no (org_id, list_no),
  KEY ix_shop_status (org_id, status),
  CONSTRAINT fk_shop_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_shop_req FOREIGN KEY (requested_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_shop_asg FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  list_id            INT UNSIGNED NOT NULL,
  line_no            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  description        VARCHAR(200) NOT NULL,
  quantity           DECIMAL(12,2) NOT NULL DEFAULT 1,
  unit               VARCHAR(20)  NOT NULL DEFAULT 'ea',
  estimated_unit_cost DECIMAL(20,2) NOT NULL DEFAULT 0,
  status             ENUM('needed','bought','unavailable') NOT NULL DEFAULT 'needed',
  bought_qty         DECIMAL(12,2) NULL,
  actual_unit_cost   DECIMAL(20,2) NULL,
  vendor_note        VARCHAR(200) NULL,
  notes              VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_sli_list (list_id, line_no),
  CONSTRAINT fk_sli_list FOREIGN KEY (list_id) REFERENCES shopping_lists (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE errands
  ADD CONSTRAINT fk_errand_shop FOREIGN KEY (shopping_list_id) REFERENCES shopping_lists (id) ON DELETE SET NULL;
