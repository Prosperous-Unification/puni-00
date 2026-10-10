ALTER TABLE prospect_session ADD COLUMN mode TEXT NOT NULL DEFAULT 'demo' CHECK(mode IN ('demo','oidc'));
CREATE TABLE provider_call (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES prospect_account(id),
  utc_day TEXT NOT NULL,
  reserved_micro_usd INTEGER NOT NULL,
  settled_micro_usd INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX provider_call_day ON provider_call(utc_day);
CREATE TABLE oidc_login (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE oidc_identity (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES prospect_account(id),
  PRIMARY KEY (issuer, subject)
);
