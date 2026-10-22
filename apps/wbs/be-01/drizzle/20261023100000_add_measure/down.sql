-- Reverses `20261023100000_add_measure`, refusing while any organization holds
-- a definition beyond the five seeded keys: dropping it would discard a measure
-- an organization defined. Seeded rows are recreated by coming forward again
-- (a renamed seeded definition loses its rename). The later slices' tables that
-- reference `measure` carry their own guards and reverse first.
-- Proof: guard statements removed; `refuses rollback while a defined measure
-- exists` in measure-schema.db.test.ts dropped the table with `gpu` in it;
-- watched 2026-10-23.
CREATE TEMP TABLE measure_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "defined measures exist: record every measure row whose key is not time, tokens, hours, cost or agent_minutes, remove each with deleteMeasure (or by hand) before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for measure definitions" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO measure_rollback_guard SELECT count(*) FROM measure
  WHERE key NOT IN ('time', 'tokens', 'hours', 'cost', 'agent_minutes');
--> statement-breakpoint
DROP TABLE measure_rollback_guard;
--> statement-breakpoint
DROP TRIGGER organization_seed_measures;
--> statement-breakpoint
DROP TRIGGER measure_key_frozen;
--> statement-breakpoint
DROP INDEX measure_one_scheduling;
--> statement-breakpoint
DROP INDEX measure_organization_key;
--> statement-breakpoint
DROP TABLE measure;
