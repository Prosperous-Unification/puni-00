CREATE TABLE step_migration_report (
  fingerprint TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organization(id),
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  reported_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id,kind,subject_id)
);
