CREATE TABLE conversation (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES intake_draft(id),
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('open', 'exhausted', 'handed_off')),
  exhausted_reason TEXT CHECK(exhausted_reason IN ('turns', 'conversation_spend', 'source_spend', 'site_spend')),
  created_at INTEGER NOT NULL,
  CHECK((state = 'exhausted') = (exhausted_reason IS NOT NULL))
);
CREATE INDEX conversation_source_day ON conversation(source_hash, created_at);
CREATE TABLE conversation_turn (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX conversation_turn_order ON conversation_turn(conversation_id, created_at);
CREATE TABLE conversation_operation (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id),
  idempotency_key TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  message TEXT NOT NULL,
  initial INTEGER NOT NULL CHECK(initial IN (0, 1)),
  stage TEXT NOT NULL CHECK(stage IN ('clarify', 'brief', 'contact')),
  prompt_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('inflight', 'completed', 'unknown')),
  utc_day TEXT NOT NULL,
  reserved_micro_usd INTEGER,
  settled_micro_usd INTEGER,
  settlement TEXT CHECK(settlement IN ('usage', 'reserved_ceiling')),
  overrun INTEGER NOT NULL DEFAULT 0 CHECK(overrun IN (0, 1)),
  generation_id TEXT,
  reply TEXT,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK(truncated IN (0, 1)),
  created_at INTEGER NOT NULL,
  CHECK((state = 'inflight') = (settlement IS NULL)),
  CHECK((state = 'unknown') = (settlement IS 'reserved_ceiling')),
  CHECK(settlement IS NOT 'reserved_ceiling' OR settled_micro_usd IS reserved_micro_usd)
);
CREATE UNIQUE INDEX conversation_operation_attempt ON conversation_operation(conversation_id, idempotency_key) WHERE state <> 'unknown';
CREATE INDEX conversation_operation_day ON conversation_operation(utc_day);
CREATE INDEX conversation_operation_source_day ON conversation_operation(source_hash, utc_day);
CREATE INDEX conversation_operation_state ON conversation_operation(conversation_id, state);
CREATE TABLE source_salt (
  utc_day TEXT PRIMARY KEY,
  salt BLOB NOT NULL CHECK(length(salt) = 32)
);
