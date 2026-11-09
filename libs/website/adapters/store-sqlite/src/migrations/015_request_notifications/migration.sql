CREATE TABLE request_notification (
  submission_id TEXT PRIMARY KEY REFERENCES proposal_submission(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  lease_token TEXT,
  delivered_at INTEGER
);
CREATE INDEX request_notification_due ON request_notification(delivered_at, available_at);
-- Proof: disabling this trigger failed the committed/replayed capture test with zero obligations.
CREATE TRIGGER request_notification_insert AFTER INSERT ON proposal_submission
WHEN NEW.email <> '' AND NEW.brief <> '' BEGIN
  INSERT INTO request_notification (submission_id, available_at) VALUES (NEW.id, NEW.created_at);
END;
-- Proof: disabling this trigger left two obligations in the predecessor-writer erasure test.
CREATE TRIGGER request_notification_erase AFTER UPDATE OF email, brief ON proposal_submission
WHEN NEW.email = '' OR NEW.brief = '' BEGIN
  DELETE FROM request_notification WHERE submission_id = NEW.id;
END;
-- Proof: disabling this backfill failed the migration test with no pending legacy obligation.
INSERT INTO request_notification (submission_id, available_at)
SELECT id, created_at FROM proposal_submission WHERE status = 'submitted' AND email <> '' AND brief <> '';
