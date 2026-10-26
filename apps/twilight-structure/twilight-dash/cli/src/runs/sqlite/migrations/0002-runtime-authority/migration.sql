CREATE TABLE run_format (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  bundle_hash TEXT NOT NULL,
  scope_count INTEGER NOT NULL CHECK(scope_count >= 0),
  intent_count INTEGER NOT NULL CHECK(intent_count >= 0),
  acceptance_count INTEGER NOT NULL CHECK(acceptance_count >= 0)
);
--> statement-breakpoint
CREATE TABLE run_runtime_scope (
  scope_key TEXT PRIMARY KEY,
  pin TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0)
);
--> statement-breakpoint
CREATE TABLE run_runtime_intent (
  command_id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL REFERENCES run_runtime_scope(scope_key),
  record TEXT NOT NULL,
  UNIQUE(command_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run_runtime_acceptance (
  command_id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL REFERENCES run_runtime_scope(scope_key),
  record TEXT NOT NULL,
  FOREIGN KEY(command_id, scope_key) REFERENCES run_runtime_intent(command_id, scope_key)
);
--> statement-breakpoint
UPDATE run_meta SET schema_version = 2 WHERE singleton = 1;
--> statement-breakpoint
