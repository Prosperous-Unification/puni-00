CREATE TABLE step_blockage_activation (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  state TEXT NOT NULL CHECK (state IN ('DISABLED', 'ENABLED'))
);
--> statement-breakpoint
INSERT INTO step_blockage_activation (id,state) VALUES (1,'DISABLED');
--> statement-breakpoint
-- Proof: insert trigger replaced by SELECT 1; independent disabled insert
-- writer negative received no throw (2026-10-14).
-- Proof: count and enabled predicates omitted separately; duplicate-marker
-- and default-disabled independent insert negatives received no throw (2026-10-14).
CREATE TRIGGER step_blockage_admit_insert
BEFORE INSERT ON step_blockage
WHEN (SELECT count(*) FROM step_blockage_activation) <> 1
  OR NOT EXISTS (SELECT 1 FROM step_blockage_activation WHERE id = 1 AND state = 'ENABLED')
BEGIN
  SELECT RAISE(ABORT, 'step_blockage_inactive');
END;
--> statement-breakpoint
-- Proof: update trigger replaced by SELECT 1; independent disabled update
-- writer negative received no throw (2026-10-14).
CREATE TRIGGER step_blockage_admit_update
BEFORE UPDATE ON step_blockage
WHEN (SELECT count(*) FROM step_blockage_activation) <> 1
  OR NOT EXISTS (SELECT 1 FROM step_blockage_activation WHERE id = 1 AND state = 'ENABLED')
BEGIN
  SELECT RAISE(ABORT, 'step_blockage_inactive');
END;
--> statement-breakpoint
-- Proof: delete trigger replaced by SELECT 1; independent disabled delete
-- writer negative received no throw (2026-10-14).
CREATE TRIGGER step_blockage_admit_delete
BEFORE DELETE ON step_blockage
WHEN (SELECT count(*) FROM step_blockage_activation) <> 1
  OR NOT EXISTS (SELECT 1 FROM step_blockage_activation WHERE id = 1 AND state = 'ENABLED')
BEGIN
  SELECT RAISE(ABORT, 'step_blockage_inactive');
END;
