-- Current cleanup addresses are separate from immutable reported/signed addresses.
CREATE TABLE resource_use_location (
  use_id TEXT NOT NULL REFERENCES resource_use(id),
  kind TEXT NOT NULL CHECK (kind IN ('claim','attempt','unassociated')),
  work_package_id TEXT NOT NULL CHECK (length(work_package_id)>0),
  work_item_id TEXT,
  CHECK ((kind='unassociated' AND work_item_id IS NULL) OR
         (kind IN ('claim','attempt') AND typeof(work_item_id)='text' AND length(work_item_id)>0)),
  UNIQUE(use_id,kind,work_item_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX resource_use_location_unassociated ON resource_use_location(use_id) WHERE kind='unassociated';
--> statement-breakpoint
CREATE UNIQUE INDEX resource_use_location_attempt ON resource_use_location(use_id) WHERE kind='attempt';
--> statement-breakpoint
CREATE INDEX resource_use_location_current ON resource_use_location(work_package_id,work_item_id,kind,use_id);
--> statement-breakpoint
-- Stable immutable binding identity proves where the live claim moved. No
-- original-address fallback or uniqueness-based attempt inference is admitted.
-- JSON.parse retains each decoded key's last physical value. Type/value use
-- the same final json_each row; immutable binding text remains untouched.
WITH runtime_bindings AS (
  SELECT b.*,CASE WHEN json_valid(b.binding) THEN b.binding ELSE '{}' END AS binding_json
  FROM runtime_claim_binding b WHERE EXISTS(SELECT 1 FROM resource_use u WHERE u.state='active' AND u.organization_id=b.organization_id AND u.work_package_id=b.work_package_id AND u.responsible_person_id=b.person_id)
), last_top AS (
  SELECT b.*,json_type(b.binding_json) AS binding_type,
    (SELECT type FROM json_each(b.binding_json) WHERE key='claimId' ORDER BY id DESC LIMIT 1) AS binding_claim_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='claimId' ORDER BY id DESC LIMIT 1) AS binding_claim_value,
    (SELECT type FROM json_each(b.binding_json) WHERE key='workItemId' ORDER BY id DESC LIMIT 1) AS binding_work_item_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='workItemId' ORDER BY id DESC LIMIT 1) AS binding_work_item_value,
    (SELECT type FROM json_each(b.binding_json) WHERE key='stepId' ORDER BY id DESC LIMIT 1) AS binding_step_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='stepId' ORDER BY id DESC LIMIT 1) AS binding_step_value,
    (SELECT type FROM json_each(b.binding_json) WHERE key='parentClaimId' ORDER BY id DESC LIMIT 1) AS binding_parent_claim_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='parentClaimId' ORDER BY id DESC LIMIT 1) AS binding_parent_claim_value,
    (SELECT type FROM json_each(b.binding_json) WHERE key='execution' ORDER BY id DESC LIMIT 1) AS binding_execution_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='execution' ORDER BY id DESC LIMIT 1) AS binding_execution_value
  FROM runtime_bindings b
), decoded_bindings AS (
  SELECT b.*,
    CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END AS execution_json,
    (SELECT type FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='storeId' ORDER BY id DESC LIMIT 1) AS binding_store_type,
    (SELECT value FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='storeId' ORDER BY id DESC LIMIT 1) AS binding_store_value,
    (SELECT type FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='runId' ORDER BY id DESC LIMIT 1) AS binding_run_type,
    (SELECT value FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='runId' ORDER BY id DESC LIMIT 1) AS binding_run_value,
    (SELECT type FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='attemptId' ORDER BY id DESC LIMIT 1) AS binding_attempt_type,
    (SELECT value FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='attemptId' ORDER BY id DESC LIMIT 1) AS binding_attempt_value,
    (SELECT type FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='sessionId' ORDER BY id DESC LIMIT 1) AS binding_session_type,
    (SELECT value FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='sessionId' ORDER BY id DESC LIMIT 1) AS binding_session_value
  FROM last_top b
)
INSERT INTO resource_use_location(use_id,kind,work_package_id,work_item_id)
SELECT DISTINCT u.id,'claim',u.work_package_id,c.work_item_id
FROM resource_use u
JOIN decoded_bindings b ON b.organization_id=u.organization_id
 AND b.work_package_id=u.work_package_id AND b.person_id=u.responsible_person_id
JOIN claim c ON c.id=b.claim_id AND c.person_id=u.responsible_person_id AND c.run_id=u.agent_run
JOIN work_item w ON w.id=c.work_item_id AND w.work_package_id=u.work_package_id
JOIN step_definition current_definition ON current_definition.id=c.step_id
 AND current_definition.organization_id=u.organization_id
JOIN work_package_step package_value ON package_value.work_package_id=u.work_package_id
 AND package_value.step_id=current_definition.id
WHERE u.state='active'
 AND b.binding_claim_value=b.claim_id
 AND b.binding_store_value=b.store_id
 AND b.binding_attempt_value=b.attempt_id
 AND b.binding_run_value=u.agent_run
 AND b.binding_work_item_value=u.work_item_id
 -- A retained binding can name the retired loser of an actual117 merge.
 -- Only an absent current identity uses its exact history edge; the live claim,
 -- definition organization and package value still name the current target.
 AND (b.binding_step_value=current_definition.id OR (
   NOT EXISTS(SELECT 1 FROM step_definition retained_definition
     WHERE retained_definition.id=b.binding_step_value)
   AND EXISTS(SELECT 1 FROM step_identity_history prior_identity
     WHERE prior_identity.old_step_id=b.binding_step_value
       AND prior_identity.step_id=current_definition.id)))
 AND (u.step_id IS NULL OR c.step_id=u.step_id);
--> statement-breakpoint
-- Whole-subtree claims may coexist above a recovered point claim. Preserve all
-- their current addresses so the last-matching-claim rule spans a lawful split.
WITH RECURSIVE ancestors(use_id,work_package_id,work_item_id) AS (
  SELECT use_id,work_package_id,work_item_id FROM resource_use_location WHERE kind='claim'
  UNION
  SELECT a.use_id,a.work_package_id,w.parent_id FROM ancestors a
  JOIN work_item w ON w.id=a.work_item_id AND w.work_package_id=a.work_package_id
  WHERE w.parent_id IS NOT NULL
)
INSERT INTO resource_use_location(use_id,kind,work_package_id,work_item_id)
SELECT DISTINCT a.use_id,'claim',a.work_package_id,a.work_item_id FROM ancestors a
JOIN resource_use u ON u.id=a.use_id
JOIN claim c ON c.work_item_id=a.work_item_id AND c.step_id IS NULL
 AND c.person_id=u.responsible_person_id AND c.run_id=u.agent_run
WHERE NOT EXISTS(SELECT 1 FROM resource_use_location l WHERE l.use_id=a.use_id AND l.kind='claim' AND l.work_item_id=a.work_item_id);
--> statement-breakpoint
WITH candidates(use_id,work_package_id,work_item_id) AS (
  SELECT DISTINCT u.id,u.work_package_id,a.work_item_id
  FROM resource_use u JOIN resource_use_location l ON l.use_id=u.id AND l.kind='claim'
  JOIN step_node_attempt a ON a.work_item_id=l.work_item_id AND a.step_id=u.step_id
    AND a.attempt_number=u.attempt_number AND a.executor_person_id=u.responsible_person_id
  WHERE u.state='active' AND u.step_id IS NOT NULL
)
INSERT INTO resource_use_location(use_id,kind,work_package_id,work_item_id)
SELECT use_id,'attempt',work_package_id,min(work_item_id) FROM candidates
GROUP BY use_id,work_package_id HAVING count(*)=1;
--> statement-breakpoint
-- An unclaimed broad report has no live attempt/claim address to reconstruct.
-- The marker records that absence explicitly; it does not copy the old address.
INSERT INTO resource_use_location(use_id,kind,work_package_id,work_item_id)
SELECT u.id,'unassociated',u.work_package_id,NULL FROM resource_use u
WHERE u.state='active' AND json_extract(u.snapshot,'$.source')='reported'
 AND u.step_id IS NULL AND u.attempt_number IS NULL
 AND NOT EXISTS(SELECT 1 FROM resource_use_location l WHERE l.use_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM claim c JOIN work_item w ON w.id=c.work_item_id
   WHERE w.work_package_id=u.work_package_id AND c.person_id=u.responsible_person_id AND c.run_id=u.agent_run);
--> statement-breakpoint
-- This guard also retains the required location state through later lifecycle
-- updates. Its dynamic message capability requires the actual migration owner.
CREATE TRIGGER resource_use_location_active_update BEFORE UPDATE ON resource_use
WHEN OLD.state='active' OR NEW.state='active'
BEGIN
  SELECT CASE WHEN
    EXISTS(SELECT 1 FROM resource_use_location l LEFT JOIN work_item w ON w.id=l.work_item_id
      WHERE l.use_id=OLD.id AND (l.work_package_id<>OLD.work_package_id OR
        (w.id IS NOT NULL AND w.work_package_id<>OLD.work_package_id)))
    OR EXISTS(
WITH runtime_bindings AS (
  SELECT b.*,CASE WHEN json_valid(b.binding) THEN b.binding ELSE '{}' END AS binding_json
  FROM runtime_claim_binding b WHERE b.organization_id=OLD.organization_id AND b.work_package_id=OLD.work_package_id AND b.person_id=OLD.responsible_person_id
), last_top AS (
  SELECT b.*,json_type(b.binding_json) AS binding_type,
    (SELECT type FROM json_each(b.binding_json) WHERE key='claimId' ORDER BY id DESC LIMIT 1) AS binding_claim_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='claimId' ORDER BY id DESC LIMIT 1) AS binding_claim_value,
    (SELECT type FROM json_each(b.binding_json) WHERE key='workItemId' ORDER BY id DESC LIMIT 1) AS binding_work_item_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='workItemId' ORDER BY id DESC LIMIT 1) AS binding_work_item_value,
    (SELECT type FROM json_each(b.binding_json) WHERE key='stepId' ORDER BY id DESC LIMIT 1) AS binding_step_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='stepId' ORDER BY id DESC LIMIT 1) AS binding_step_value,
    (SELECT type FROM json_each(b.binding_json) WHERE key='parentClaimId' ORDER BY id DESC LIMIT 1) AS binding_parent_claim_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='parentClaimId' ORDER BY id DESC LIMIT 1) AS binding_parent_claim_value,
    (SELECT type FROM json_each(b.binding_json) WHERE key='execution' ORDER BY id DESC LIMIT 1) AS binding_execution_type,
    (SELECT value FROM json_each(b.binding_json) WHERE key='execution' ORDER BY id DESC LIMIT 1) AS binding_execution_value
  FROM runtime_bindings b
), decoded_bindings AS (
  SELECT b.*,
    CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END AS execution_json,
    (SELECT type FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='storeId' ORDER BY id DESC LIMIT 1) AS binding_store_type,
    (SELECT value FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='storeId' ORDER BY id DESC LIMIT 1) AS binding_store_value,
    (SELECT type FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='runId' ORDER BY id DESC LIMIT 1) AS binding_run_type,
    (SELECT value FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='runId' ORDER BY id DESC LIMIT 1) AS binding_run_value,
    (SELECT type FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='attemptId' ORDER BY id DESC LIMIT 1) AS binding_attempt_type,
    (SELECT value FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='attemptId' ORDER BY id DESC LIMIT 1) AS binding_attempt_value,
    (SELECT type FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='sessionId' ORDER BY id DESC LIMIT 1) AS binding_session_type,
    (SELECT value FROM json_each(CASE WHEN b.binding_execution_type='object' THEN b.binding_execution_value ELSE '{}' END) WHERE key='sessionId' ORDER BY id DESC LIMIT 1) AS binding_session_value
  FROM last_top b
)
      SELECT 1 FROM decoded_bindings b WHERE CASE WHEN NOT json_valid(b.binding) THEN 1 ELSE
        b.binding_type IS NOT 'object'
        OR (SELECT count(DISTINCT key) FROM json_each(b.binding_json))<>5
        OR EXISTS(SELECT 1 FROM json_each(b.binding_json) WHERE key NOT IN ('claimId','workItemId','stepId','parentClaimId','execution'))
        OR b.binding_claim_type IS NOT 'text' OR length(CAST(b.binding_claim_value AS BLOB))=0
        OR b.binding_claim_value IS NOT b.claim_id
        OR b.binding_work_item_type IS NOT 'text' OR length(CAST(b.binding_work_item_value AS BLOB))=0
        OR b.binding_step_type IS NOT 'text' OR length(CAST(b.binding_step_value AS BLOB))=0
        OR NOT (b.binding_parent_claim_type IS 'null' OR
          (b.binding_parent_claim_type IS 'text' AND length(CAST(b.binding_parent_claim_value AS BLOB))>0))
        OR b.binding_execution_type IS NOT 'object'
        OR (SELECT count(DISTINCT key) FROM json_each(b.execution_json))<>4
        OR EXISTS(SELECT 1 FROM json_each(b.execution_json) WHERE key NOT IN ('storeId','runId','attemptId','sessionId'))
        OR b.binding_store_type IS NOT 'text' OR length(CAST(b.binding_store_value AS BLOB))=0
        OR b.binding_store_value IS NOT b.store_id
        OR b.binding_run_type IS NOT 'text' OR length(CAST(b.binding_run_value AS BLOB))=0
        OR b.binding_attempt_type IS NOT 'text' OR length(CAST(b.binding_attempt_value AS BLOB))=0
        OR b.binding_attempt_value IS NOT b.attempt_id
        OR b.binding_session_type IS NOT 'text'
        -- JSON quoting removes embedded NUL from the SQL text being traversed.
        -- Escape tokens count one UTF16 unit; raw supplementary characters count two.
        -- A valid 256-unit session occupies at most 1538 quoted characters.
        OR CASE WHEN length(json_quote(b.binding_session_value)) BETWEEN 3 AND 1538 THEN
          (WITH RECURSIVE session(encoded) AS (SELECT json_quote(b.binding_session_value)),
          units(position,total) AS (
            SELECT 2,0
            UNION ALL
            SELECT position + CASE WHEN substr(encoded,position,1)=char(92)
                THEN CASE WHEN substr(encoded,position+1,1)='u' THEN 6 ELSE 2 END ELSE 1 END,
              total + CASE WHEN substr(encoded,position,1)<>char(92) AND unicode(substr(encoded,position,1))>65535 THEN 2 ELSE 1 END
            FROM units,session WHERE position<length(encoded)
          ) SELECT max(total) FROM units) NOT BETWEEN 1 AND 256
          ELSE 1 END END)
    OR (OLD.step_id IS NULL)<>(OLD.attempt_number IS NULL)
    OR NOT (
      ((SELECT count(*) FROM resource_use_location l WHERE l.use_id=OLD.id AND l.kind='unassociated')=1
       AND (SELECT count(*) FROM resource_use_location l WHERE l.use_id=OLD.id)=1
       AND OLD.step_id IS NULL AND OLD.attempt_number IS NULL)
      OR
      ((SELECT count(*) FROM resource_use_location l WHERE l.use_id=OLD.id AND l.kind='unassociated')=0
       AND (SELECT count(*) FROM resource_use_location l WHERE l.use_id=OLD.id AND l.kind='claim')>=1
       AND (SELECT count(*) FROM resource_use_location l WHERE l.use_id=OLD.id AND l.kind='attempt')=CASE WHEN OLD.step_id IS NULL THEN 0 ELSE 1 END)
    )
  THEN RAISE(ABORT,'resource use '||OLD.id||' has unprovable lifecycle continuity; before retrying migration, use the authorized POST /api/work-packages/'||OLD.work_package_id||'/resource-uses/'||OLD.id||'/events with cleanup_requested, fresh eventId, current expectedRevision and reason; resolve cleanup without rewriting retained observations') END;
END;
--> statement-breakpoint
UPDATE resource_use SET state=state WHERE state='active';
