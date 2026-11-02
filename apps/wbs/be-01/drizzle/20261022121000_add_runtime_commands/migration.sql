CREATE TABLE runtime_ledger (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), schema_version INTEGER NOT NULL CHECK (schema_version = 1), ledger_id TEXT NOT NULL CHECK (length(ledger_id) > 0), authority_count INTEGER NOT NULL CHECK (typeof(authority_count) = 'integer' AND authority_count BETWEEN 0 AND 9007199254740991), binding_count INTEGER NOT NULL CHECK (typeof(binding_count) = 'integer' AND binding_count BETWEEN 0 AND 9007199254740991), receipt_count INTEGER NOT NULL CHECK (typeof(receipt_count) = 'integer' AND receipt_count BETWEEN 0 AND 9007199254740991));
--> statement-breakpoint
-- Proof: P20 removed generation bounds; direct SQL accepted invalid authority generations.
CREATE TABLE runtime_authority (organization_id TEXT NOT NULL CHECK (length(organization_id) > 0), project_id TEXT NOT NULL CHECK (length(project_id) > 0), person_id TEXT NOT NULL CHECK (length(person_id) > 0), owner_id TEXT NOT NULL CHECK (length(owner_id) > 0), generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation BETWEEN 1 AND 9007199254740991), PRIMARY KEY (organization_id, project_id, person_id));
--> statement-breakpoint
-- Proof: P19/P36 removed attempt/claim uniqueness; direct SQL inserted a second permanent identity.
CREATE TABLE runtime_claim_binding (organization_id TEXT NOT NULL CHECK (length(organization_id) > 0), project_id TEXT NOT NULL CHECK (length(project_id) > 0), person_id TEXT NOT NULL CHECK (length(person_id) > 0), claim_id TEXT NOT NULL CHECK (length(claim_id) > 0), store_id TEXT NOT NULL CHECK (length(store_id) > 0), attempt_id TEXT NOT NULL CHECK (length(attempt_id) > 0), binding TEXT NOT NULL CHECK (json_valid(binding)), PRIMARY KEY (organization_id, project_id, person_id, claim_id), UNIQUE (organization_id, project_id, person_id, store_id, attempt_id));
--> statement-breakpoint
-- Proof: P37 removed command uniqueness; direct SQL inserted a second scoped command identity.
CREATE TABLE runtime_command_receipt (organization_id TEXT NOT NULL CHECK (length(organization_id) > 0), project_id TEXT NOT NULL CHECK (length(project_id) > 0), person_id TEXT NOT NULL CHECK (length(person_id) > 0), command_id TEXT NOT NULL CHECK (length(command_id) > 0), accepted TEXT NOT NULL CHECK (json_valid(accepted)), PRIMARY KEY (organization_id, project_id, person_id, command_id));
--> statement-breakpoint
-- Proof: P29/P30/P43-P47 removed the corresponding trigger or clause; direct SQL immutable-history negatives then succeeded.
CREATE TRIGGER runtime_ledger_no_delete BEFORE DELETE ON runtime_ledger BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END;
--> statement-breakpoint
-- Proof: P29/P30/P43-P47 removed the corresponding trigger or clause; direct SQL immutable-history negatives then succeeded.
CREATE TRIGGER runtime_authority_no_delete BEFORE DELETE ON runtime_authority BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END;
--> statement-breakpoint
-- Proof: P29/P30/P43-P47 removed the corresponding trigger or clause; direct SQL immutable-history negatives then succeeded.
CREATE TRIGGER runtime_claim_binding_no_delete BEFORE DELETE ON runtime_claim_binding BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END;
--> statement-breakpoint
-- Proof: P29/P30/P43-P47 removed the corresponding trigger or clause; direct SQL immutable-history negatives then succeeded.
CREATE TRIGGER runtime_command_receipt_no_delete BEFORE DELETE ON runtime_command_receipt BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END;
--> statement-breakpoint
-- Proof: P29/P30/P43-P47 removed the corresponding trigger or clause; direct SQL immutable-history negatives then succeeded.
CREATE TRIGGER runtime_claim_binding_no_update BEFORE UPDATE ON runtime_claim_binding BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END;
--> statement-breakpoint
-- Proof: P29/P30/P43-P47 removed the corresponding trigger or clause; direct SQL immutable-history negatives then succeeded.
CREATE TRIGGER runtime_command_receipt_no_update BEFORE UPDATE ON runtime_command_receipt BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END;
--> statement-breakpoint
-- Proof: P29/P30/P43-P47 removed the corresponding trigger or clause; direct SQL immutable-history negatives then succeeded.
CREATE TRIGGER runtime_ledger_monotonic BEFORE UPDATE ON runtime_ledger WHEN NEW.id IS NOT OLD.id OR NEW.schema_version IS NOT OLD.schema_version OR NEW.ledger_id IS NOT OLD.ledger_id OR NEW.authority_count < OLD.authority_count OR NEW.binding_count < OLD.binding_count OR NEW.receipt_count < OLD.receipt_count BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END;
--> statement-breakpoint
-- Proof: P29/P30/P43-P47 removed the corresponding trigger or clause; direct SQL immutable-history negatives then succeeded.
CREATE TRIGGER runtime_authority_monotonic BEFORE UPDATE ON runtime_authority WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.project_id IS NOT OLD.project_id OR NEW.person_id IS NOT OLD.person_id OR NEW.generation != OLD.generation + 1 BEGIN SELECT RAISE(ABORT, 'runtime authority must advance exactly once'); END;
--> statement-breakpoint
INSERT INTO runtime_ledger (id,schema_version,ledger_id,authority_count,binding_count,receipt_count) VALUES (1,1,lower(hex(randomblob(16))),0,0,0);
