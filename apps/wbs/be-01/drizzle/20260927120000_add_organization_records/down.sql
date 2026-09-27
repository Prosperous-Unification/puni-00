-- Reverses `20260927120000_add_organization_records`.
--
-- Safe only before tenancy activation, and only because the forward migration
-- touched no existing table: no project, catalog or user row refers to these
-- tables, so dropping them leaves every legacy record and relationship exactly
-- as the previous release reads them. What is lost is the organization records
-- themselves. After activation this reversal must never run; the durable
-- activation marker that refuses it arrives with task 2.6.
--
-- Children before parents, so foreign keys hold at every step.
DROP TABLE `organization_domain_claim`;
--> statement-breakpoint
DROP TABLE `organization_join_request`;
--> statement-breakpoint
DROP TABLE `organization_invitation`;
--> statement-breakpoint
DROP TABLE `organization_membership`;
--> statement-breakpoint
DROP TABLE `organization`;
--> statement-breakpoint
DROP TABLE `external_identity`;
