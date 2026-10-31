CREATE TABLE run5_record (
  run_id TEXT PRIMARY KEY,
  manifest_digest TEXT NOT NULL REFERENCES run_manifest(digest),
  record TEXT NOT NULL,
  initial_record TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE run5_attempt (
  attempt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES run5_record(run_id),
  occurrence_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  record TEXT NOT NULL,
  admission TEXT NOT NULL,
  UNIQUE(run_id, occurrence_id, ordinal)
);
--> statement-breakpoint
CREATE TABLE run5_reservation (
  attempt_id TEXT PRIMARY KEY REFERENCES run5_attempt(attempt_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX run5_active_occurrence ON run5_attempt(run_id, occurrence_id)
  WHERE json_extract(record, '$.state.kind') NOT IN ('interrupted','terminal');
--> statement-breakpoint
CREATE TABLE run5_execution (
  command_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES run5_attempt(attempt_id),
  record TEXT NOT NULL,
  reply TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE run5_completion (
  command_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES run5_attempt(attempt_id),
  record TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE run5_outbox (
  command_id TEXT PRIMARY KEY REFERENCES run5_completion(command_id)
);
--> statement-breakpoint
CREATE TABLE run5_decision (
 decision_id TEXT PRIMARY KEY,
 attempt_id TEXT NOT NULL REFERENCES run5_attempt(attempt_id),
 record TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE run5_consumption (
 decision_id TEXT PRIMARY KEY REFERENCES run5_decision(decision_id),
 attempt_id TEXT NOT NULL REFERENCES run5_attempt(attempt_id),
 correlation_key TEXT NOT NULL,
 wait TEXT NOT NULL,
 reply TEXT NOT NULL,
 UNIQUE(attempt_id,correlation_key)
);
--> statement-breakpoint
CREATE TABLE run5_receipt (
 command_id TEXT PRIMARY KEY REFERENCES run5_completion(command_id),
 attempt_id TEXT NOT NULL UNIQUE REFERENCES run5_attempt(attempt_id),
 record TEXT NOT NULL,
 reply TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE run5_runtime_scope (
  scope_key TEXT PRIMARY KEY,
  pin TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0)
);
--> statement-breakpoint
CREATE TABLE run5_runtime_intent (
  command_id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL REFERENCES run5_runtime_scope(scope_key),
  record TEXT NOT NULL,
  UNIQUE(command_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run5_runtime_acceptance (
  command_id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL REFERENCES run5_runtime_scope(scope_key),
  record TEXT NOT NULL,
  FOREIGN KEY(command_id, scope_key) REFERENCES run5_runtime_intent(command_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run5_recovery_journal (
  recovery_id TEXT PRIMARY KEY NOT NULL,
  command_id TEXT NOT NULL UNIQUE,
  scope_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  record TEXT NOT NULL,
  UNIQUE(recovery_id, scope_key),
  FOREIGN KEY(command_id, scope_key) REFERENCES run5_runtime_intent(command_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run5_recovery_fence (
  recovery_id TEXT NOT NULL REFERENCES run5_recovery_journal(recovery_id),
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  command_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  record TEXT NOT NULL,
  PRIMARY KEY(recovery_id, ordinal)
);
--> statement-breakpoint
CREATE TABLE run5_recovery_observation (
  recovery_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  revision INTEGER NOT NULL CHECK(revision > 0),
  record TEXT NOT NULL,
  PRIMARY KEY(recovery_id, ordinal),
  FOREIGN KEY(recovery_id, ordinal) REFERENCES run5_recovery_fence(recovery_id, ordinal)
);
--> statement-breakpoint
CREATE TABLE run5_recovery_closure (
  recovery_id TEXT PRIMARY KEY NOT NULL REFERENCES run5_recovery_journal(recovery_id),
  revision INTEGER NOT NULL CHECK(revision > 0),
  record TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE run5_recovery_barrier (
  scope_key TEXT NOT NULL,
  scope_after INTEGER NOT NULL CHECK(scope_after > 0),
  recovery_id TEXT NOT NULL UNIQUE REFERENCES run5_recovery_closure(recovery_id),
  record TEXT NOT NULL,
  PRIMARY KEY(scope_key, scope_after),
  FOREIGN KEY(recovery_id, scope_key) REFERENCES run5_recovery_journal(recovery_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run5_recovery_active (
  scope_key TEXT PRIMARY KEY NOT NULL,
  recovery_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY(recovery_id, scope_key) REFERENCES run5_recovery_journal(recovery_id, scope_key)
);
--> statement-breakpoint
CREATE TABLE run5_recovery_format (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  journal_count INTEGER NOT NULL CHECK(journal_count >= 0),
  fence_count INTEGER NOT NULL CHECK(fence_count >= 0),
  observation_count INTEGER NOT NULL CHECK(observation_count >= 0),
  closure_count INTEGER NOT NULL CHECK(closure_count >= 0),
  barrier_count INTEGER NOT NULL CHECK(barrier_count >= 0),
  active_count INTEGER NOT NULL CHECK(active_count >= 0)
);
--> statement-breakpoint
CREATE TABLE run5_runtime_format (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  scope_count INTEGER NOT NULL CHECK(scope_count >= 0),
  intent_count INTEGER NOT NULL CHECK(intent_count >= 0),
  acceptance_count INTEGER NOT NULL CHECK(acceptance_count >= 0)
);
--> statement-breakpoint
INSERT INTO run5_runtime_format VALUES (1,0,0,0);
--> statement-breakpoint
INSERT INTO run5_recovery_format VALUES (1,0,0,0,0,0,0);
--> statement-breakpoint
CREATE TABLE run5_usage (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  used INTEGER NOT NULL CHECK(used IN (0,1))
);
--> statement-breakpoint
INSERT INTO run5_usage VALUES (1,0);
--> statement-breakpoint
