CREATE TABLE run_recovery_journal (
  recovery_id TEXT PRIMARY KEY NOT NULL,
  command_id TEXT NOT NULL UNIQUE,
  scope_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  record TEXT NOT NULL,
  UNIQUE(recovery_id, scope_key),
  FOREIGN KEY(command_id, scope_key) REFERENCES run_runtime_intent(command_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run_recovery_fence (
  recovery_id TEXT NOT NULL REFERENCES run_recovery_journal(recovery_id),
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  command_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  record TEXT NOT NULL,
  PRIMARY KEY(recovery_id, ordinal)
);
--> statement-breakpoint
CREATE TABLE run_recovery_observation (
  recovery_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  revision INTEGER NOT NULL CHECK(revision > 0),
  record TEXT NOT NULL,
  PRIMARY KEY(recovery_id, ordinal),
  FOREIGN KEY(recovery_id, ordinal) REFERENCES run_recovery_fence(recovery_id, ordinal)
);
--> statement-breakpoint
CREATE TABLE run_recovery_closure (
  recovery_id TEXT PRIMARY KEY NOT NULL REFERENCES run_recovery_journal(recovery_id),
  revision INTEGER NOT NULL CHECK(revision > 0),
  record TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE run_recovery_barrier (
  scope_key TEXT NOT NULL,
  scope_after INTEGER NOT NULL CHECK(scope_after > 0),
  recovery_id TEXT NOT NULL UNIQUE REFERENCES run_recovery_closure(recovery_id),
  record TEXT NOT NULL,
  PRIMARY KEY(scope_key, scope_after),
  FOREIGN KEY(recovery_id, scope_key) REFERENCES run_recovery_journal(recovery_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run_recovery_active (
  scope_key TEXT PRIMARY KEY NOT NULL,
  recovery_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY(recovery_id, scope_key) REFERENCES run_recovery_journal(recovery_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run_recovery_format (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  journal_count INTEGER NOT NULL CHECK(journal_count >= 0),
  fence_count INTEGER NOT NULL CHECK(fence_count >= 0),
  observation_count INTEGER NOT NULL CHECK(observation_count >= 0),
  closure_count INTEGER NOT NULL CHECK(closure_count >= 0),
  barrier_count INTEGER NOT NULL CHECK(barrier_count >= 0),
  active_count INTEGER NOT NULL CHECK(active_count >= 0)
);
--> statement-breakpoint
INSERT INTO run_recovery_format VALUES (1,0,0,0,0,0,0);
--> statement-breakpoint
UPDATE run_meta SET schema_version = 4 WHERE singleton = 1;
--> statement-breakpoint
