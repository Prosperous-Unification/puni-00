PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE authority_meta (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    schema_version TEXT NOT NULL,
    next_generation INTEGER NOT NULL CHECK (next_generation >= 1)
  ) STRICT;
INSERT INTO authority_meta VALUES(1,'module-wiki-authority.v5',4);
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
INSERT INTO authority_generation VALUES('one','/tmp/wiki-integration-race-rNWYvP/.writer-one',1,'integrated',1000,1000,'3dd5b56a07fabb0cdff888c1af658492cdda24d4265ea80c9fa20a8c632dcbcb','d5758e1ecd03eb13b073d71e318e38c3dc1369a3909d985b0108cfd44c2e6a94','4e2f8c5d6218a388ff29b2afa1fe9f0a4214e87274cce1fd3989a920d7d9509f','a951ffd88d6c1bb47d465bc0e307dc5bb7dc2376ed42e2e45c47d5f74635c30b',replace('{"base":{"commit":"e543d9a6e3e5be6b64e84a79dfdb846746baa00f","tree":"5410a47ba0a9b5554e297291c6929f44aa1876e7"},"checks":["check.integration"],"conflictGroups":[],"consumedContracts":[],"consumedInterfaces":[],"evidenceRequirements":["review.integration"],"generation":1,"invariants":["invariant.integration"],"mappingIdentity":"2222222222222222222222222222222222222222222222222222222222222222","objective":"Change src/one.ts","outcome":"src/one.ts changes","ownedPaths":["src/one.ts"],"policyIdentity":"45cf5a84066ee1e90bc0c0ceb3dbfc3bf3a7126e8115a4aa94c0b3857eb9b14e","producedContracts":[],"producedInterfaces":[],"readDependencies":[],"schemaVersion":1,"sessionId":"one","worktreePath":"/tmp/wiki-integration-race-rNWYvP/.writer-one"}\n','\n',char(10)));
INSERT INTO authority_generation VALUES('two','/tmp/wiki-integration-race-rNWYvP/.writer-two',2,'submitted',1000,1000,'1a9587dc588487f90931d1383fa25b71db26fcf23760e43a7bbc0c99037cbfdf','9ed19236a50e91538e4a9bf127fbde8712c959800d8b37d67ab9121e2abb1255','4642346a8c04f85aff9e3a3700767956c0ec29bbf231bdb11362cdc1cd237553','5ee6634eb2ea9f6035814af622b6b5b1e74d7a519a55839b7e5ae03878a7ba75',replace('{"base":{"commit":"e543d9a6e3e5be6b64e84a79dfdb846746baa00f","tree":"5410a47ba0a9b5554e297291c6929f44aa1876e7"},"checks":["check.integration"],"conflictGroups":[],"consumedContracts":[],"consumedInterfaces":[],"evidenceRequirements":["review.integration"],"generation":2,"invariants":["invariant.integration"],"mappingIdentity":"2222222222222222222222222222222222222222222222222222222222222222","objective":"Change src/two.ts","outcome":"src/two.ts changes","ownedPaths":["src/two.ts"],"policyIdentity":"45cf5a84066ee1e90bc0c0ceb3dbfc3bf3a7126e8115a4aa94c0b3857eb9b14e","producedContracts":[],"producedInterfaces":[],"readDependencies":[],"schemaVersion":1,"sessionId":"two","worktreePath":"/tmp/wiki-integration-race-rNWYvP/.writer-two"}\n','\n',char(10)));
INSERT INTO authority_generation VALUES('three','/tmp/wiki-integration-race-rNWYvP/.writer-three',3,'working',1000,1000,NULL,NULL,NULL,NULL,NULL);
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
INSERT INTO authority_claim VALUES('two',2,'path','write','src/two.ts');
INSERT INTO authority_claim VALUES('three',3,'group',NULL,'group.golden');
INSERT INTO authority_claim VALUES('three',3,'path','read','src/four.ts');
INSERT INTO authority_claim VALUES('three',3,'path','write','src/three.ts');
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
INSERT INTO authority_integration VALUES('golden','refs/heads/main','published',1000,1000,1,'639321282876fb71f9c8aa8491468fe1673eec56857b3cb5565062f7c4d5bc3c','e543d9a6e3e5be6b64e84a79dfdb846746baa00f','c930c7f359eb425743c4eeb8571d506657def8e6','4f021b6a094c50849b7f08ba8697930c70b8308ac9498c078464b802fde68e75','2c8bdf75dfd5256afea5489c6d0806276a6b215a','refs/module-wiki/publications/54b8a60bc0ed50597cf940fdb6425f691c33cb47355f2348bec6dd402d5f0b8a',NULL);
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
INSERT INTO authority_integration_submission VALUES('golden','one',1,'a951ffd88d6c1bb47d465bc0e307dc5bb7dc2376ed42e2e45c47d5f74635c30b','3dd5b56a07fabb0cdff888c1af658492cdda24d4265ea80c9fa20a8c632dcbcb');
CREATE TABLE authority_integration_resource (
    integration_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('lane', 'port')),
    identity TEXT NOT NULL,
    PRIMARY KEY (integration_id, kind, identity),
    FOREIGN KEY (integration_id) REFERENCES authority_integration(integration_id) ON DELETE CASCADE
  ) STRICT;
COMMIT;
