SELECT project_id,input_hash,objective,contract_version,budget_ms,certificate_json,generation,attempt_token,created_at FROM optimization_boundary_certificate LIMIT 0;
--> statement-breakpoint
CREATE TEMP TABLE boundary_certificate_rollback_guard (allowed INTEGER CONSTRAINT "retained boundary certificates require compatible recovery" CHECK (allowed = 1));
--> statement-breakpoint
-- Proof: removing retention/schema predicates independently made retained/replaced rollback tests accept destructive rollback.
INSERT INTO boundary_certificate_rollback_guard SELECT CASE WHEN
 NOT EXISTS (SELECT 1 FROM optimization_boundary_certificate)
 AND (SELECT replace(replace(replace(replace(sql,' ',''),char(10),''),char(13),''),char(9),'') FROM sqlite_master WHERE type='table' AND name='optimization_boundary_certificate') = 'CREATETABLEoptimization_boundary_certificate(project_idTEXTNOTNULLREFERENCESproject(id)ONDELETECASCADE,input_hashTEXTNOTNULL,objectiveTEXTNOTNULLCHECK(objectiveIN(''pri'',''time'')),contract_versionTEXTNOTNULL,budget_msINTEGERNOTNULL,certificate_jsonTEXTNOTNULL,generationINTEGERNOTNULL,attempt_tokenTEXTNOTNULL,created_atINTEGERNOTNULL,PRIMARYKEY(project_id,input_hash,objective,contract_version,budget_ms))'
 THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE boundary_certificate_rollback_guard;
--> statement-breakpoint
DROP TABLE optimization_boundary_certificate;
