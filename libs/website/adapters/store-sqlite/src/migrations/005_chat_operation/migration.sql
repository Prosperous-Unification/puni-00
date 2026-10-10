CREATE TABLE chat_operation (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES prospect_account(id),
  request_id TEXT NOT NULL REFERENCES software_request(id),
  idempotency_key TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  message TEXT NOT NULL,
  initial INTEGER NOT NULL CHECK(initial IN (0, 1)),
  state TEXT NOT NULL CHECK(state IN ('inflight', 'completed', 'unknown')),
  provider_call_id TEXT REFERENCES provider_call(id),
  reply TEXT,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK(truncated IN (0, 1)),
  created_at INTEGER NOT NULL,
  UNIQUE(request_id, idempotency_key)
);
CREATE INDEX chat_operation_account_state ON chat_operation(account_id, state);
