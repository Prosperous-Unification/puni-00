CREATE TABLE authority_meta (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    schema_version TEXT NOT NULL,
    next_generation INTEGER NOT NULL CHECK (next_generation >= 1)
  ) STRICT;
CREATE TABLE authority_generation (
    session_id TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    generation INTEGER NOT NULL UNIQUE CHECK (generation >= 1),
    status TEXT NOT NULL CHECK (status IN ('working', 'investigating', 'submitted', 'integrated', 'rejected', 'abandoned', 'released')),
    heartbeat_at INTEGER NOT NULL CHECK (heartbeat_at >= 0),
    status_at INTEGER NOT NULL CHECK (status_at >= heartbeat_at),
    patch_identity TEXT,
    candidate_diff_identity TEXT,
    content_identity TEXT,
    packet_identity TEXT,
    packet_bytes TEXT,
    PRIMARY KEY (session_id, generation),
    CHECK ((patch_identity IS NULL AND candidate_diff_identity IS NULL AND content_identity IS NULL) OR (patch_identity IS NOT NULL AND candidate_diff_identity IS NOT NULL AND content_identity IS NOT NULL)),
    CHECK ((packet_identity IS NULL AND packet_bytes IS NULL) OR (packet_identity IS NOT NULL AND packet_bytes IS NOT NULL)),
    CHECK ((status IN ('submitted', 'integrated') AND patch_identity IS NOT NULL) OR (status IN ('working', 'investigating', 'released') AND patch_identity IS NULL) OR (status IN ('rejected', 'abandoned')))
  ) STRICT;
CREATE TABLE authority_claim (
    session_id TEXT NOT NULL,
    generation INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('path', 'group')),
    access TEXT CHECK (access IN ('read', 'write')),
    identity TEXT NOT NULL,
    PRIMARY KEY (session_id, kind, identity),
    FOREIGN KEY (session_id, generation) REFERENCES authority_generation(session_id, generation) ON DELETE CASCADE,
    CHECK ((kind = 'path' AND access IS NOT NULL) OR (kind = 'group' AND access IS NULL))
  ) STRICT;
CREATE TABLE authority_integration (
    integration_id TEXT PRIMARY KEY,
    target_ref TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'checking', 'rework', 'publishing', 'published', 'terminal')),
    queued_at INTEGER NOT NULL CHECK (queued_at >= 0),
    status_at INTEGER NOT NULL CHECK (status_at >= queued_at),
    attempt_count INTEGER NOT NULL CHECK (attempt_count BETWEEN 0 AND 3),
    attempt_identity TEXT,
    base_commit TEXT,
    candidate_tree TEXT,
    composition_identity TEXT,
    candidate_commit TEXT,
    marker_ref TEXT,
    terminal_reason TEXT
  ) STRICT;
CREATE TABLE authority_integration_submission (
    integration_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation >= 1),
    packet_identity TEXT NOT NULL,
    patch_identity TEXT NOT NULL,
    PRIMARY KEY (integration_id, session_id, generation),
    FOREIGN KEY (integration_id) REFERENCES authority_integration(integration_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id, generation) REFERENCES authority_generation(session_id, generation)
  ) STRICT;
CREATE TABLE authority_integration_resource (
    integration_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('lane', 'port')),
    identity TEXT NOT NULL,
    PRIMARY KEY (integration_id, kind, identity),
    FOREIGN KEY (integration_id) REFERENCES authority_integration(integration_id) ON DELETE CASCADE
  ) STRICT;
INSERT INTO authority_meta VALUES(1,'module-wiki-authority.v5',1);
