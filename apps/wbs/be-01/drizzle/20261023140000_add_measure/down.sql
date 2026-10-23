-- Reverses `20261023140000_add_measure`, refusing while any organization holds
-- a definition beyond the five seeded keys, or a seeded definition that differs
-- from its seed: dropping either would discard what an organization defined or
-- edited, and coming forward again would recreate the seed's defaults. The
-- later slices' tables that reference `measure` carry their own guards and
-- reverse first.
-- Proof: guard statements removed; `refuses rollback while a defined measure
-- exists` and `refuses rollback over an edited seeded definition` in
-- measure-schema.db.test.ts dropped the table with its rows; watched 2026-10-23.
CREATE TEMP TABLE measure_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "defined or edited measures exist: record every measure row whose key is not time, tokens, hours, cost or agent_minutes and every seeded row whose name, unit, flags, order or currency differ from the seed, remove the defined ones with deleteMeasure and patch the seeded ones back to their seed values (or do both by hand) before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for measure definitions" CHECK (rows = 0)
);
--> statement-breakpoint
WITH seed (key, name, unit, kind, scale, three_point, show_by_default, schedules_work, derived, position, currency) AS (
  VALUES
    ('time', 'Time', 'days', 'duration', 'real', 1, 1, 1, 0, 1, NULL),
    ('tokens', 'Tokens', 'tokens', 'count', 'integer', 1, 0, 0, 0, 2, NULL),
    ('hours', 'Hours', 'hours', 'duration', 'real', 0, 0, 0, 0, 3, NULL),
    ('cost', 'Cost', 'micro-USD', 'money', 'integer', 1, 0, 0, 0, 4, 'USD'),
    ('agent_minutes', 'Agent minutes', 'minutes', 'duration', 'integer', 0, 0, 0, 1, 5, NULL)
)
INSERT INTO measure_rollback_guard SELECT count(*) FROM measure AS m
  WHERE NOT EXISTS (SELECT 1 FROM seed AS s
    WHERE s.key = m.key AND s.name = m.name AND s.unit = m.unit AND s.kind = m.kind
      AND s.scale = m.scale AND s.three_point = m.three_point
      AND s.show_by_default = m.show_by_default AND s.schedules_work = m.schedules_work
      AND s.derived = m.derived AND s.position = m."order" AND s.currency IS m.currency);
--> statement-breakpoint
DROP TABLE measure_rollback_guard;
--> statement-breakpoint
DROP TRIGGER organization_seed_measures;
--> statement-breakpoint
DROP TRIGGER measure_shape_frozen;
--> statement-breakpoint
DROP INDEX measure_one_scheduling;
--> statement-breakpoint
DROP INDEX measure_organization_key;
--> statement-breakpoint
DROP TABLE measure;
