CREATE TABLE optimization_boundary_certificate (
 project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 input_hash TEXT NOT NULL,
 objective TEXT NOT NULL CHECK (objective IN ('pri','time')),
 contract_version TEXT NOT NULL,
 budget_ms INTEGER NOT NULL,
 certificate_json TEXT NOT NULL,
 generation INTEGER NOT NULL,
 attempt_token TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(project_id,input_hash,objective,contract_version,budget_ms)
);
