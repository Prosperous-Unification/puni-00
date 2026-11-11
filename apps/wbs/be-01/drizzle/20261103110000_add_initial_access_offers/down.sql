-- ADR0081: retain every offer, including consumed and revoked history.
CREATE TEMP TABLE `initial_access_offer_down_check` (
  `representable` integer NOT NULL,
  CONSTRAINT "initial access offers cannot be represented by the previous binary"
    CHECK (`representable` = 1)
);
--> statement-breakpoint
/* Proof: offer-guarded-down: removed/changed production boundary.
 * refuses offer rollback before changing historical evidence at explicit-none
 * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
INSERT INTO `initial_access_offer_down_check` (`representable`)
SELECT NOT EXISTS (
  SELECT 1 FROM `organization_invitation`
  /* Proof: offer-down-all-history: removed/changed production boundary.
   * refuses offer rollback before changing historical evidence at explicit-none
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  WHERE CASE
    WHEN `initial_access` IS NULL THEN 0
    /* Proof: offer-down-json-diagnostic: named malformed-JSON rollback diagnostic; SQLite still rejects malformed JSON downstream.
     * refuses offer rollback before changing historical evidence at malformed-json
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    WHEN json_valid(`initial_access`) <> 1 THEN 0
    /* Proof: offer-down-object-projection: canonical JSON object projection dependency; no absent-leaf guard-removal claim.
     * reverses representable initial access while preserving all offer history
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    WHEN json_type(`initial_access`) <> 'object' THEN 0
    WHEN (SELECT COUNT(*) FROM json_each(`initial_access`)) <> 2 THEN 0
    /* Proof: offer-down-json-kind: removed/changed production boundary.
     * refuses offer rollback before changing historical evidence at unknown-kind
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    /* Proof: offer-down-missing-kind-null: SQL NULL-safe malformed historical-envelope guard.
     * refuses offer rollback before changing historical evidence at missing-kind-extra
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    WHEN json_type(`initial_access`, '$.kind') IS NOT 'text'
      OR json_extract(`initial_access`, '$.kind') IS NOT 'role' THEN 0
    /* Proof: offer-down-role-projection: canonical role-id text projection dependency; no absent-leaf guard-removal claim.
     * reverses representable initial access while preserving all offer history
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    WHEN json_type(`initial_access`, '$.roleId') <> 'text' THEN 0
    /* Proof: offer-down-inverse-admin: removed/changed production boundary.
     * refuses offer rollback before changing historical evidence at inverse-mismatch
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    WHEN json_extract(`initial_access`, '$.roleId') = 'org-admin' AND `role` = 'admin' THEN 1
    /* Proof: offer-down-inverse-contributor: removed/changed production boundary.
     * refuses offer rollback before changing historical evidence at inverse-member-mismatch
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    WHEN json_extract(`initial_access`, '$.roleId') = 'project-contributor' AND `role` = 'member' THEN 1
    /* Proof: offer-down-inverse-viewer: removed/changed production boundary.
     * refuses offer rollback before changing historical evidence at inverse-viewer-mismatch
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    WHEN json_extract(`initial_access`, '$.roleId') = 'project-viewer' AND `role` = 'viewer' THEN 1
    ELSE 0
  END <> 1
);
--> statement-breakpoint
DROP TABLE `initial_access_offer_down_check`;
--> statement-breakpoint
DROP TRIGGER `organization_invitation_initial_access`;
--> statement-breakpoint
ALTER TABLE `organization_invitation` DROP COLUMN `initial_access`;
