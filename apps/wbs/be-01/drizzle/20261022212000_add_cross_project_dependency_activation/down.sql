SELECT id,state FROM cross_project_dependency_activation LIMIT 0;
--> statement-breakpoint
SELECT id,receipt FROM cross_project_dependency_activation_receipt LIMIT 0;
--> statement-breakpoint
CREATE TEMP TABLE dependency_activation_rollback_guard (allowed INTEGER CONSTRAINT "dependency activation requires compatible recovery" CHECK (allowed = 1));
--> statement-breakpoint
-- Proof: replacing this guard insertion with VALUES (1) made the independent SQL down enabled-authority test fail to throw (2026-10-23); runner admission was not invoked.
-- Proof: allowing ENABLED with its receipt lost enabled-empty authority; omitting the edge predicate erased dormant retained rows; omitting each schema comparison erased its replacement table (2026-10-22).
INSERT INTO dependency_activation_rollback_guard SELECT CASE WHEN
 (SELECT count(*) FROM cross_project_dependency_activation) = 1
 AND EXISTS (SELECT 1 FROM cross_project_dependency_activation WHERE id=1 AND state='DISABLED')
 AND NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation_receipt)
 AND NOT EXISTS (SELECT 1 FROM external_dependency)
 AND (SELECT replace(replace(replace(replace(sql,' ',''),char(10),''),char(13),''),char(9),'') FROM sqlite_master WHERE type='table' AND name='cross_project_dependency_activation') = 'CREATETABLEcross_project_dependency_activation(idINTEGERPRIMARYKEYNOTNULLCONSTRAINT"externaldependenciesprecedeactivationauthority"CHECK(id=1),stateTEXTNOTNULLCHECK(stateIN(''DISABLED'',''ENABLED'')))'
 AND (SELECT replace(replace(replace(replace(sql,' ',''),char(10),''),char(13),''),char(9),'') FROM sqlite_master WHERE type='table' AND name='cross_project_dependency_activation_receipt') = 'CREATETABLEcross_project_dependency_activation_receipt(idINTEGERPRIMARYKEYNOTNULLCHECK(id=1),receiptTEXTNOTNULLCHECK(json_valid(receipt)))'
 THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE dependency_activation_rollback_guard;
--> statement-breakpoint
DROP TRIGGER external_dependency_admit_insert;
--> statement-breakpoint
DROP TRIGGER external_dependency_admit_update;
--> statement-breakpoint
DROP TRIGGER external_dependency_admit_delete;
--> statement-breakpoint
DROP TABLE cross_project_dependency_activation_receipt;
--> statement-breakpoint
DROP TABLE cross_project_dependency_activation;
