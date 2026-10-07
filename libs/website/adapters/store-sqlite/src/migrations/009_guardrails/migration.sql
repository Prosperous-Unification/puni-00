-- Additive: blue and green share this file mid-swap, and the outgoing release never names these tables.
CREATE TABLE admission_count (
  scope TEXT NOT NULL CHECK(scope IN ('draft:source', 'draft:site', 'proposal:source', 'proposal:email', 'proposal:site')),
  key_hash TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count > 0),
  PRIMARY KEY (scope, key_hash, utc_day)
);
CREATE TABLE login_failure (
  scope TEXT NOT NULL CHECK(scope IN ('source', 'account')),
  key_hash TEXT NOT NULL,
  failures INTEGER NOT NULL CHECK(failures > 0),
  window_opened_at INTEGER NOT NULL,
  locked_until INTEGER,
  PRIMARY KEY (scope, key_hash)
);
CREATE TABLE inference_pause (
  id TEXT PRIMARY KEY,
  paused_at INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('site_spend', 'operator')),
  paused_by TEXT NOT NULL CHECK(paused_by IN ('system', 'operator')),
  resumed_at INTEGER,
  resumed_by TEXT CHECK(resumed_by IN ('operator')),
  CHECK((resumed_at IS NULL) = (resumed_by IS NULL))
);
-- Proof: without this index the second-open-pause store test inserted two open rows.
CREATE UNIQUE INDEX inference_pause_open ON inference_pause((resumed_at IS NULL)) WHERE resumed_at IS NULL;
CREATE TABLE guardrail_alert (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivery TEXT NOT NULL CHECK(delivery IN ('recorded', 'sent', 'failed')),
  delivered_at INTEGER
);
CREATE INDEX guardrail_alert_created ON guardrail_alert(created_at);
