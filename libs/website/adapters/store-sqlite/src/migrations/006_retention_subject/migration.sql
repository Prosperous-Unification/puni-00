CREATE TABLE retention_subject (
  subject_kind TEXT NOT NULL CHECK(subject_kind IN ('software_request', 'proposal_submission')),
  subject_id TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK(resolution IN ('pending_content', 'anchored', 'ambiguous')),
  ambiguity TEXT CHECK(ambiguity IN ('unanchored_content', 'content_predates_anchor', 'overlapping_lineage')),
  anchor_at INTEGER,
  deadline_at INTEGER,
  anchor_source TEXT CHECK(anchor_source IN ('draft', 'first_write', 'operator')),
  evidence_reference TEXT,
  resolved_by TEXT,
  resolved_at INTEGER,
  classification TEXT NOT NULL DEFAULT 'non_client' CHECK(classification IN ('non_client', 'client', 'hold')),
  PRIMARY KEY (subject_kind, subject_id),
  CHECK((resolution = 'anchored') = (anchor_at IS NOT NULL AND deadline_at IS NOT NULL AND anchor_source IS NOT NULL)),
  CHECK(resolution <> 'ambiguous' OR ambiguity IS NOT NULL),
  CHECK(resolution <> 'pending_content' OR ambiguity IS NULL),
  CHECK((anchor_source IS 'operator') = (evidence_reference IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX retention_subject_deadline ON retention_subject(resolution, deadline_at);
-- Proof: without this trigger, the schema-refuses-to-move test updated an anchored subject; without the
-- evidence, resolver and resolution-time columns, the rewrite-an-operator-resolution test changed them.
CREATE TRIGGER retention_subject_anchor_immutable
BEFORE UPDATE OF subject_kind, subject_id, resolution, ambiguity, anchor_at, deadline_at, anchor_source, evidence_reference, resolved_by, resolved_at ON retention_subject
WHEN OLD.anchor_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'retention anchor is immutable');
END;
CREATE TABLE retention_journal_position (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  applied_sequence INTEGER NOT NULL CHECK(applied_sequence >= 0)
);
INSERT INTO retention_journal_position (singleton, applied_sequence) VALUES (1, 0);
