-- Proof: removing the singleton ID constraint or state constraint admitted its independent wrong-ID/unknown-state corruption; removing state NOT NULL admitted NULL (2026-10-22).
CREATE TABLE cross_project_dependency_activation (
 id INTEGER PRIMARY KEY NOT NULL CONSTRAINT "external dependencies precede activation authority" CHECK (id = 1),
 state TEXT NOT NULL CHECK (state IN ('DISABLED','ENABLED'))
);
--> statement-breakpoint
-- Proof: forcing id=1 admitted preexisting external rows through the real runner (2026-10-22).
INSERT INTO cross_project_dependency_activation (id,state) SELECT CASE WHEN EXISTS (SELECT 1 FROM external_dependency) THEN 0 ELSE 1 END,'DISABLED';
--> statement-breakpoint
-- Proof: removing receipt ID or JSON validation admitted wrong-ID/malformed SQL writes; removing the JSON and NOT NULL constraints together admitted NULL (2026-10-22).
CREATE TABLE cross_project_dependency_activation_receipt (
 id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
 receipt TEXT NOT NULL CHECK (json_valid(receipt))
);
--> statement-breakpoint
-- Proof: disabling this INSERT trigger admitted its dormant repository write; removing each count/state/receipt identity/protocol/version predicate admitted its independent-writer fault (2026-10-22).
CREATE TRIGGER external_dependency_admit_insert
BEFORE INSERT ON external_dependency
WHEN (SELECT count(*) FROM cross_project_dependency_activation) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation WHERE id = 1 AND state = 'ENABLED')
 OR (SELECT count(*) FROM cross_project_dependency_activation_receipt) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation_receipt WHERE id = 1 AND json_valid(receipt) AND json_extract(receipt,'$.protocol') = 'wbs-dependency-activation' AND json_extract(receipt,'$.version') = 1)
BEGIN
 SELECT RAISE(ABORT, 'external_dependencies_inactive');
END;
--> statement-breakpoint
-- Proof: disabling this UPDATE trigger admitted its dormant repository write; removing each count/state/receipt identity/protocol/version predicate admitted its independent-writer fault (2026-10-22).
CREATE TRIGGER external_dependency_admit_update
BEFORE UPDATE ON external_dependency
WHEN (SELECT count(*) FROM cross_project_dependency_activation) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation WHERE id = 1 AND state = 'ENABLED')
 OR (SELECT count(*) FROM cross_project_dependency_activation_receipt) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation_receipt WHERE id = 1 AND json_valid(receipt) AND json_extract(receipt,'$.protocol') = 'wbs-dependency-activation' AND json_extract(receipt,'$.version') = 1)
BEGIN
 SELECT RAISE(ABORT, 'external_dependencies_inactive');
END;
--> statement-breakpoint
-- Proof: disabling this DELETE trigger admitted its dormant repository write; removing each count/state/receipt identity/protocol/version predicate admitted its independent-writer fault (2026-10-22).
CREATE TRIGGER external_dependency_admit_delete
BEFORE DELETE ON external_dependency
WHEN (SELECT count(*) FROM cross_project_dependency_activation) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation WHERE id = 1 AND state = 'ENABLED')
 OR (SELECT count(*) FROM cross_project_dependency_activation_receipt) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation_receipt WHERE id = 1 AND json_valid(receipt) AND json_extract(receipt,'$.protocol') = 'wbs-dependency-activation' AND json_extract(receipt,'$.version') = 1)
BEGIN
 SELECT RAISE(ABORT, 'external_dependencies_inactive');
END;
