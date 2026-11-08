CREATE TABLE browser_claim (
  hash TEXT PRIMARY KEY,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE intake_draft_browser (
  draft_id TEXT PRIMARY KEY REFERENCES intake_draft(id) ON DELETE CASCADE,
  browser_hash TEXT NOT NULL
);
INSERT INTO intake_draft_browser SELECT id, 'legacy:' || id FROM intake_draft;
CREATE TABLE paid_attempt (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL DEFAULT 'conversation' CHECK(origin IN ('conversation', 'provider')),
  operation_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  browser_hash TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  admitted_at INTEGER NOT NULL,
  reserved_micro_usd INTEGER NOT NULL,
  settled_micro_usd INTEGER,
  state TEXT NOT NULL,
  UNIQUE(origin, operation_id)
);
CREATE INDEX paid_attempt_time ON paid_attempt(admitted_at);
CREATE INDEX paid_attempt_browser ON paid_attempt(browser_hash, admitted_at);
CREATE INDEX paid_attempt_source ON paid_attempt(source_hash, admitted_at);
CREATE INDEX paid_attempt_conversation ON paid_attempt(conversation_id);
-- Proof: removing this backfill lost the old conversation charge in the migration-backfill test.
INSERT INTO paid_attempt (operation_id, conversation_id, browser_hash, source_hash, utc_day, admitted_at, reserved_micro_usd, settled_micro_usd, state)
SELECT step.id, step.conversation_id, binding.browser_hash, step.source_hash, step.utc_day, step.created_at, step.reserved_micro_usd, step.settled_micro_usd, step.state
FROM conversation_operation AS step JOIN conversation AS talk ON talk.id = step.conversation_id JOIN intake_draft_browser AS binding ON binding.draft_id = talk.draft_id WHERE step.reserved_micro_usd IS NOT NULL;
-- Proof: removing this backfill lost retired-provider spend in the migration-backfill test.
INSERT INTO paid_attempt (origin, operation_id, conversation_id, browser_hash, source_hash, utc_day, admitted_at, reserved_micro_usd, settled_micro_usd, state)
SELECT 'provider', id, 'provider:' || id, 'provider:' || account_id, 'provider:' || account_id, utc_day, created_at, reserved_micro_usd, settled_micro_usd, CASE WHEN settled_micro_usd IS NULL THEN 'inflight' ELSE 'completed' END FROM provider_call;
-- Proof: removing this trigger lost retained conversation spend in the content-deletion test.
CREATE TRIGGER paid_attempt_conversation_insert AFTER INSERT ON conversation_operation WHEN NEW.reserved_micro_usd IS NOT NULL BEGIN
  INSERT INTO paid_attempt (operation_id, conversation_id, browser_hash, source_hash, utc_day, admitted_at, reserved_micro_usd, settled_micro_usd, state)
  SELECT NEW.id, NEW.conversation_id, COALESCE(binding.browser_hash, 'legacy:' || talk.draft_id), NEW.source_hash, NEW.utc_day, NEW.created_at, NEW.reserved_micro_usd, NEW.settled_micro_usd, NEW.state
  FROM conversation AS talk LEFT JOIN intake_draft_browser AS binding ON binding.draft_id = talk.draft_id WHERE talk.id = NEW.conversation_id;
END;
-- Proof: removing this trigger kept the reservation after compatible-writer settlement in the content-deletion test.
CREATE TRIGGER paid_attempt_conversation_update AFTER UPDATE OF reserved_micro_usd, settled_micro_usd, state ON conversation_operation WHEN NEW.reserved_micro_usd IS NOT NULL BEGIN
  UPDATE paid_attempt SET reserved_micro_usd = NEW.reserved_micro_usd, settled_micro_usd = NEW.settled_micro_usd, state = NEW.state WHERE origin = 'conversation' AND operation_id = NEW.id;
END;
-- Proof: removing this trigger lost retired-provider insert spend in the retired-provider trigger test.
CREATE TRIGGER paid_attempt_provider_insert AFTER INSERT ON provider_call BEGIN
  INSERT INTO paid_attempt (origin, operation_id, conversation_id, browser_hash, source_hash, utc_day, admitted_at, reserved_micro_usd, settled_micro_usd, state)
  VALUES ('provider', NEW.id, 'provider:' || NEW.id, 'provider:' || NEW.account_id, 'provider:' || NEW.account_id, NEW.utc_day, NEW.created_at, NEW.reserved_micro_usd, NEW.settled_micro_usd, CASE WHEN NEW.settled_micro_usd IS NULL THEN 'inflight' ELSE 'completed' END);
END;
-- Proof: removing this trigger kept the reservation after retired-provider settlement in the retired-provider trigger test.
CREATE TRIGGER paid_attempt_provider_update AFTER UPDATE OF reserved_micro_usd, settled_micro_usd ON provider_call BEGIN
  UPDATE paid_attempt SET reserved_micro_usd = NEW.reserved_micro_usd, settled_micro_usd = NEW.settled_micro_usd, state = CASE WHEN NEW.settled_micro_usd IS NULL THEN 'inflight' ELSE 'completed' END WHERE origin = 'provider' AND operation_id = NEW.id;
END;
CREATE TABLE testing_allowance (
  browser_hash TEXT PRIMARY KEY,
  after_sequence INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE TABLE testing_conversation (
  conversation_id TEXT PRIMARY KEY,
  after_sequence INTEGER NOT NULL,
  visitor_turns INTEGER NOT NULL
);
-- Proof: removing this guard let a predecessor cleanup delete paid original rows still needed by its daily reader in anonymous-admission.test.ts.
CREATE TRIGGER paid_attempt_retained_operation_delete BEFORE DELETE ON conversation_operation
WHEN OLD.reserved_micro_usd IS NOT NULL AND (
  OLD.utc_day >= strftime('%Y-%m-01', 'now') OR
  OLD.created_at >= CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000
) BEGIN
  SELECT RAISE(ABORT, 'Paid accounting is still retained');
END;
-- Proof: removing this guard let the predecessor-provider cleanup test delete a current-month charge.
CREATE TRIGGER paid_attempt_retained_provider_delete BEFORE DELETE ON provider_call
WHEN OLD.utc_day >= strftime('%Y-%m-01', 'now') OR
  OLD.created_at >= CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000
BEGIN
  SELECT RAISE(ABORT, 'Paid accounting is still retained');
END;
