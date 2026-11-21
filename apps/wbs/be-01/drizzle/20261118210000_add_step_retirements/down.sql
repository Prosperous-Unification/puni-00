CREATE TABLE step_retirement_down_guard (checked INTEGER NOT NULL);
--> statement-breakpoint
CREATE TRIGGER step_retirement_down_refusal BEFORE INSERT ON step_retirement_down_guard
WHEN EXISTS(SELECT 1 FROM step_retirement)
BEGIN
 SELECT RAISE(ABORT,'step retirement records require current schema; downgrade would reactivate identities');
END;
--> statement-breakpoint
INSERT INTO step_retirement_down_guard VALUES(1);
--> statement-breakpoint
DROP TRIGGER step_retirement_down_refusal;
--> statement-breakpoint
DROP TABLE step_retirement_down_guard;
--> statement-breakpoint
DROP TRIGGER step_binding_active_update;
--> statement-breakpoint
DROP TRIGGER step_binding_active_insert;
--> statement-breakpoint
DROP TRIGGER step_retirement_immutable_delete;
--> statement-breakpoint
DROP TRIGGER step_retirement_immutable_update;
--> statement-breakpoint
DROP TRIGGER step_retirement_requires_unbound;
--> statement-breakpoint
DROP TABLE step_retirement;
