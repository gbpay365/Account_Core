-- =============================================================================
-- LedgerCore :: 006_errand_kinds.sql
-- Errand kinds become a per-organisation catalogue so staff can add new ones.
-- =============================================================================

CREATE TABLE IF NOT EXISTS errand_kinds (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id      INT UNSIGNED NOT NULL,
  code        VARCHAR(40)  NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  name_en     VARCHAR(80)  NOT NULL,
  is_system   TINYINT(1)   NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_errand_kind (org_id, code),
  KEY ix_errand_kind_org (org_id, is_active, sort_order),
  CONSTRAINT fk_ekind_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
SELECT id, 'purchase_run', 'Course d''achat', 'Purchase run', 1, 10 FROM organizations;
INSERT IGNORE INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
SELECT id, 'fleet', 'Parc / garage', 'Fleet / garage', 1, 20 FROM organizations;
INSERT IGNORE INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
SELECT id, 'it_hardware', 'Matériel informatique', 'IT hardware', 1, 30 FROM organizations;
INSERT IGNORE INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
SELECT id, 'electrical', 'Électricité', 'Electrical', 1, 40 FROM organizations;
INSERT IGNORE INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
SELECT id, 'network', 'Câblage réseau', 'Network cabling', 1, 50 FROM organizations;
INSERT IGNORE INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
SELECT id, 'general', 'Général', 'General', 1, 60 FROM organizations;

ALTER TABLE errands
  MODIFY COLUMN kind VARCHAR(40) NOT NULL DEFAULT 'general';

INSERT IGNORE INTO errand_kinds (org_id, code, name, name_en, is_system, sort_order)
SELECT e.org_id, e.kind, e.kind, e.kind, 0, 200
  FROM errands e
  LEFT JOIN errand_kinds k ON k.org_id = e.org_id AND k.code = e.kind
 WHERE k.id IS NULL
 GROUP BY e.org_id, e.kind;

ALTER TABLE errands
  ADD CONSTRAINT fk_errand_kind FOREIGN KEY (org_id, kind) REFERENCES errand_kinds (org_id, code);
