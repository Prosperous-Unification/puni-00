CREATE TABLE accepted_plan_reference_policy (
  singleton INTEGER PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  grants TEXT NOT NULL,
  CONSTRAINT accepted_plan_reference_policy_singleton CHECK (singleton = 1),
  CONSTRAINT accepted_plan_reference_policy_revision CHECK (revision BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
INSERT INTO accepted_plan_reference_policy (singleton, revision, grants) VALUES (1, 1, '[]');
--> statement-breakpoint
CREATE TABLE accepted_plan_reference (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  repository TEXT NOT NULL,
  change TEXT NOT NULL,
  version INTEGER NOT NULL,
  reference_digest TEXT NOT NULL,
  write_basis TEXT NOT NULL,
  artifacts TEXT NOT NULL,
  subject TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  policy_revision INTEGER NOT NULL,
  PRIMARY KEY (organization_id, project_id, repository, change, version),
  CONSTRAINT accepted_plan_reference_version CHECK (version BETWEEN 1 AND 9007199254740991)
);
