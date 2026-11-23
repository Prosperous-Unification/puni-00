-- ADR0081: NULL is an outgoing writer's omission, never explicit no initial access.
ALTER TABLE `organization_invitation` ADD COLUMN `initial_access` text;
--> statement-breakpoint
/* Proof: offer-history-backfill: removed/changed production boundary.
 * preserves every historical offer and old-writer insert as explicit initial access
 * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
UPDATE `organization_invitation`
SET `initial_access` = CASE `role`
  WHEN 'admin' THEN '{"kind":"role","roleId":"org-admin"}'
  WHEN 'member' THEN '{"kind":"role","roleId":"project-contributor"}'
  WHEN 'viewer' THEN '{"kind":"role","roleId":"project-viewer"}'
END
WHERE `initial_access` IS NULL;
--> statement-breakpoint
/* Proof: offer-old-writer-trigger: removed/changed production boundary.
 * preserves every historical offer and old-writer insert as explicit initial access
 * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
CREATE TRIGGER `organization_invitation_initial_access`
AFTER INSERT ON `organization_invitation`
/* Proof: offer-explicit-selection: removed/changed production boundary.
 * preserves every historical offer and old-writer insert as explicit initial access
 * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
WHEN NEW.`initial_access` IS NULL
BEGIN
  UPDATE `organization_invitation`
  SET `initial_access` = CASE NEW.`role`
    WHEN 'admin' THEN '{"kind":"role","roleId":"org-admin"}'
    WHEN 'member' THEN '{"kind":"role","roleId":"project-contributor"}'
    WHEN 'viewer' THEN '{"kind":"role","roleId":"project-viewer"}'
  END
  /* Proof: offer-insert-row-binding: canonical inserted-row binding dependency; no healthy-row predicate-removal claim.
   * preserves every historical offer and old-writer insert as explicit initial access
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  WHERE `id` = NEW.`id`;
END;
