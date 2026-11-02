-- Exact admin-granted authority is retained after credential/provider deletion; reads never regain authority from snapshots.
CREATE TABLE resource_authority (
  authority_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  epoch TEXT NOT NULL,
  accepted_sequence INTEGER NOT NULL DEFAULT 0 CHECK(accepted_sequence >= 0),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(organization_id,provider_id)
);
--> statement-breakpoint
CREATE TABLE resource_runtime_use (
  use_id TEXT PRIMARY KEY NOT NULL REFERENCES resource_use(id),
  authority_id TEXT NOT NULL REFERENCES resource_authority(authority_id),
  incarnation TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  declaration TEXT NOT NULL CHECK(json_valid(declaration))
);
--> statement-breakpoint
CREATE TABLE resource_runtime_event (
  authority_id TEXT NOT NULL REFERENCES resource_authority(authority_id),
  event_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  fingerprint TEXT NOT NULL,
  response TEXT NOT NULL CHECK(json_valid(response)),
  PRIMARY KEY(authority_id,event_id),
  UNIQUE(authority_id,sequence)
);
--> statement-breakpoint
CREATE TABLE resource_cleanup_request (
  request_id INTEGER PRIMARY KEY AUTOINCREMENT,
  authority_id TEXT NOT NULL REFERENCES resource_authority(authority_id),
  use_id TEXT NOT NULL REFERENCES resource_use(id),
  incarnation TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL,
  acknowledged_sequence INTEGER
);
--> statement-breakpoint
CREATE INDEX resource_cleanup_request_authority ON resource_cleanup_request(authority_id,request_id);
