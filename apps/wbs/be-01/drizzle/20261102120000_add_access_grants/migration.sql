-- Access grants (`wbs-permissions` task 1.1, amended by `wbs-custom-permissions`
-- task 1.1; design.md "Tables" and "Backfill migration" of both). Additive:
-- five new tables, their triggers and indexes, the built-in catalogue and a
-- backfill; no existing table or column changes, and the outgoing release reads
-- none of it. `organization_membership.role` stays the old release's authority.
--
-- `access_role` holds built-in and custom roles in one table (CP7): a built-in
-- has `organization_id` NULL, `id` = `name` and a display `level`; a custom role
-- has an organization and no level. `access_role_permission` is every role's
-- set; its `permission` has no CHECK list (CP9): the store refuses an unknown id
-- on write and the evaluator throws on read. The nine built-ins and their sets
-- are `BUILT_IN_ROLES` in `@wbs/domain`, and `access-grant-migration.db.test.ts`
-- holds the rows below equal to `permission-matrix.md` cell by cell.
--
-- The backfill keeps today's reach across the swap (E8, P6, P7, P17): every
-- membership becomes one organization-scope grant, every organization-owned
-- project's owner who is a current member of that organization a
-- `package-manager` grant on it (today's `project` row is the work package; no
-- project-scope row, no project entity exists yet), and every unrevoked machine
-- credential bound to a current member a copy of that account's rows capped at
-- contributor. Every backfilled row has `origin = 'backfill'` and no creator.
--
-- Proof, observed 2026-10-25 in be-01 `access-grant-migration.db.test.ts`,
-- each fault alone: both reserved-name triggers removed made `refuses a custom
-- role named after a built-in` insert a custom `org-admin`; the built-in/custom
-- CHECK made `CHECK (1)` made `refuses a role that is neither built-in nor
-- custom, and an unknown kind` store a levelled custom role, and the object
-- kind's CHECK made `CHECK (1)` made it store the kind `space`; the scope,
-- subject and origin CHECKs each made `CHECK (1)`, and the six-column UNIQUE
-- removed, each made `refuses a grant outside the vocabularies and a
-- duplicate` store the row it refuses; both organization-members triggers
-- removed made `refuses an organization-members grant naming another
-- organization` store it; the composite group-member key replaced by a plain
-- `group_id` reference made `refuses a group member from another organization
-- or outside it` store a cross-organization member; `access_role_built_in_name`
-- made `CHECK (1)` made `refuses a built-in role whose name is not its id`
-- store one; `access_grant_organization_scope` made `CHECK (1)` made `refuses an
-- organization-scope grant naming another organization` store one; the owner INSERT's EXISTS
-- removed made `writes package-manager for owners who are current members
-- only` grant the non-member owners; the credential copy's CASE replaced by
-- `g.role_id` made `copies a bound account’s rows to its live credentials
-- capped at contributor` give an `org-admin`'s credential `org-admin`; one
-- seed row removed (`package-contributor` × `package.write`) made `seeds every
-- built-in role with exactly its permission-matrix.md column` fail on that cell.
CREATE TABLE `access_role` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`object_kind` text NOT NULL CHECK (`object_kind` IN ('organization', 'project', 'work_package')),
	`level` integer CHECK (`level` BETWEEN 1 AND 5),
	`organization_id` text REFERENCES `organization`(`id`),
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `access_role_built_in_or_custom` CHECK ((`organization_id` IS NULL) = (`level` IS NOT NULL)),
	CONSTRAINT `access_role_built_in_name` CHECK (`organization_id` IS NOT NULL OR `name` = `id`),
	UNIQUE (`organization_id`, `name`)
);
--> statement-breakpoint
CREATE TABLE `access_role_permission` (
	`role_id` text NOT NULL REFERENCES `access_role`(`id`) ON DELETE CASCADE,
	`permission` text NOT NULL,
	PRIMARY KEY (`role_id`, `permission`)
);
--> statement-breakpoint
CREATE TRIGGER `access_role_reserved_name_insert`
BEFORE INSERT ON `access_role`
WHEN NEW.`organization_id` IS NOT NULL
	AND EXISTS (SELECT 1 FROM `access_role` WHERE `organization_id` IS NULL AND `id` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'reserved_name: a custom access role may not take a built-in role''s name');
END;
--> statement-breakpoint
CREATE TRIGGER `access_role_reserved_name_update`
BEFORE UPDATE OF `name`, `organization_id` ON `access_role`
WHEN NEW.`organization_id` IS NOT NULL
	AND EXISTS (SELECT 1 FROM `access_role` WHERE `organization_id` IS NULL AND `id` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'reserved_name: a custom access role may not take a built-in role''s name');
END;
--> statement-breakpoint
INSERT INTO `access_role` (`id`, `name`, `object_kind`, `level`, `organization_id`, `created_at`, `created_by`) VALUES
	('org-super-admin', 'org-super-admin', 'organization', 5, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL),
	('org-admin', 'org-admin', 'organization', 4, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL),
	('org-viewer', 'org-viewer', 'organization', 1, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL),
	('project-manager', 'project-manager', 'project', 3, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL),
	('project-contributor', 'project-contributor', 'project', 2, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL),
	('project-viewer', 'project-viewer', 'project', 1, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL),
	('package-manager', 'package-manager', 'work_package', 3, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL),
	('package-contributor', 'package-contributor', 'work_package', 2, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL),
	('package-viewer', 'package-viewer', 'work_package', 1, NULL, (CAST(unixepoch('subsec') * 1000 AS integer)), NULL);
--> statement-breakpoint
INSERT INTO `access_role_permission` (`role_id`, `permission`) VALUES
	('org-super-admin', 'organization.navigate'),
	('org-super-admin', 'organization.read'),
	('org-super-admin', 'organization.manage_members'),
	('org-super-admin', 'organization.manage_directory'),
	('org-super-admin', 'organization.manage_spaces'),
	('org-super-admin', 'organization.create_project'),
	('org-super-admin', 'organization.manage_access'),
	('org-super-admin', 'organization.manage_organization_roles'),
	('org-super-admin', 'organization.manage_security'),
	('org-super-admin', 'organization.manage_capacity_mode'),
	('org-super-admin', 'organization.recover_restricted'),
	('org-super-admin', 'organization.manage_settings'),
	('org-super-admin', 'project.read'),
	('org-super-admin', 'project.manage_settings'),
	('org-super-admin', 'project.manage_budgets'),
	('org-super-admin', 'project.manage_dependencies'),
	('org-super-admin', 'project.manage_packages'),
	('org-super-admin', 'project.grant'),
	('org-super-admin', 'package.read'),
	('org-super-admin', 'package.write'),
	('org-super-admin', 'package.manage_settings'),
	('org-super-admin', 'package.claim_for_others'),
	('org-admin', 'organization.navigate'),
	('org-admin', 'organization.read'),
	('org-admin', 'organization.manage_members'),
	('org-admin', 'organization.manage_directory'),
	('org-admin', 'organization.manage_spaces'),
	('org-admin', 'organization.create_project'),
	('org-admin', 'organization.manage_access'),
	('org-admin', 'organization.manage_settings'),
	('org-admin', 'project.read'),
	('org-admin', 'project.manage_settings'),
	('org-admin', 'project.manage_budgets'),
	('org-admin', 'project.manage_dependencies'),
	('org-admin', 'project.manage_packages'),
	('org-admin', 'project.grant'),
	('org-admin', 'package.read'),
	('org-admin', 'package.write'),
	('org-admin', 'package.manage_settings'),
	('org-admin', 'package.claim_for_others'),
	('org-viewer', 'organization.navigate'),
	('org-viewer', 'organization.read'),
	('org-viewer', 'project.read'),
	('org-viewer', 'package.read'),
	('project-manager', 'organization.navigate'),
	('project-manager', 'project.read'),
	('project-manager', 'project.manage_settings'),
	('project-manager', 'project.manage_budgets'),
	('project-manager', 'project.manage_dependencies'),
	('project-manager', 'project.manage_packages'),
	('project-manager', 'project.grant'),
	('project-manager', 'package.read'),
	('project-manager', 'package.write'),
	('project-manager', 'package.manage_settings'),
	('project-manager', 'package.claim_for_others'),
	('project-contributor', 'organization.navigate'),
	('project-contributor', 'project.read'),
	('project-contributor', 'package.read'),
	('project-contributor', 'package.write'),
	('project-viewer', 'organization.navigate'),
	('project-viewer', 'project.read'),
	('project-viewer', 'package.read'),
	('package-manager', 'organization.navigate'),
	('package-manager', 'package.read'),
	('package-manager', 'package.write'),
	('package-manager', 'package.manage_settings'),
	('package-manager', 'package.claim_for_others'),
	('package-contributor', 'organization.navigate'),
	('package-contributor', 'package.read'),
	('package-contributor', 'package.write'),
	('package-viewer', 'organization.navigate'),
	('package-viewer', 'package.read');
--> statement-breakpoint
CREATE TABLE `access_group` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	UNIQUE (`organization_id`, `name`),
	UNIQUE (`organization_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `access_group_member` (
	`organization_id` text NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`created_at` integer NOT NULL,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY (`group_id`, `user_id`),
	FOREIGN KEY (`organization_id`, `group_id`) REFERENCES `access_group`(`organization_id`, `id`) ON DELETE CASCADE,
	FOREIGN KEY (`organization_id`, `user_id`) REFERENCES `organization_membership`(`organization_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `access_group_member_user` ON `access_group_member` (`organization_id`, `user_id`);
--> statement-breakpoint
CREATE TABLE `access_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`scope_kind` text NOT NULL CHECK (`scope_kind` IN ('organization', 'project', 'work_package')),
	`scope_id` text NOT NULL,
	`subject_kind` text NOT NULL CHECK (`subject_kind` IN ('user', 'group', 'organization_members', 'machine_credential')),
	`subject_id` text NOT NULL,
	`role_id` text NOT NULL REFERENCES `access_role`(`id`),
	`origin` text NOT NULL CHECK (`origin` IN ('backfill', 'route', 'invitation', 'creation')),
	`created_at` integer NOT NULL,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `access_grant_organization_scope` CHECK (`scope_kind` <> 'organization' OR `scope_id` = `organization_id`),
	UNIQUE (`organization_id`, `scope_kind`, `scope_id`, `subject_kind`, `subject_id`, `role_id`)
);
--> statement-breakpoint
CREATE INDEX `access_grant_subject` ON `access_grant` (`organization_id`, `subject_kind`, `subject_id`);
--> statement-breakpoint
CREATE INDEX `access_grant_scope` ON `access_grant` (`organization_id`, `scope_kind`, `scope_id`);
--> statement-breakpoint
-- The organization-members subject is every current member of the grant's own
-- organization, so its `subject_id` is that organization's id (design "Tables").
CREATE TRIGGER `access_grant_organization_members_insert`
BEFORE INSERT ON `access_grant`
WHEN NEW.`subject_kind` = 'organization_members' AND NEW.`subject_id` IS NOT NEW.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'an organization_members grant names its own organization as subject_id');
END;
--> statement-breakpoint
CREATE TRIGGER `access_grant_organization_members_update`
BEFORE UPDATE OF `subject_kind`, `subject_id`, `organization_id` ON `access_grant`
WHEN NEW.`subject_kind` = 'organization_members' AND NEW.`subject_id` IS NOT NEW.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'an organization_members grant names its own organization as subject_id');
END;
--> statement-breakpoint
-- E8: `super_admin` → `org-super-admin`, `admin` → `org-admin`, `member` →
-- `project-contributor`, `viewer` → `project-viewer`, all at organization
-- scope. The CASE has no ELSE: a role outside the four is a NULL `role_id`,
-- which fails the migration instead of granting a guess.
INSERT INTO `access_grant` (`id`, `organization_id`, `scope_kind`, `scope_id`, `subject_kind`, `subject_id`, `role_id`, `origin`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), m.`organization_id`, 'organization', m.`organization_id`, 'user', m.`user_id`,
	CASE m.`role`
		WHEN 'super_admin' THEN 'org-super-admin'
		WHEN 'admin' THEN 'org-admin'
		WHEN 'member' THEN 'project-contributor'
		WHEN 'viewer' THEN 'project-viewer'
	END,
	'backfill', (CAST(unixepoch('subsec') * 1000 AS integer)), NULL
FROM `organization_membership` AS m;
--> statement-breakpoint
-- P6: the owner of every organization-owned work package (today's `project`
-- and `project_organization`) keeps it as `package-manager`, but only while a
-- current member of that organization; a project no organization owns has no
-- organization to grant in and keeps no row.
INSERT INTO `access_grant` (`id`, `organization_id`, `scope_kind`, `scope_id`, `subject_kind`, `subject_id`, `role_id`, `origin`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), po.`organization_id`, 'work_package', p.`id`, 'user', p.`owner_id`,
	'package-manager', 'backfill', (CAST(unixepoch('subsec') * 1000 AS integer)), NULL
FROM `project` AS p
JOIN `project_organization` AS po ON po.`resource_id` = p.`id`
WHERE EXISTS (
	SELECT 1 FROM `organization_membership` AS m
	WHERE m.`organization_id` = po.`organization_id` AND m.`user_id` = p.`owner_id`
);
--> statement-breakpoint
-- P17: an unrevoked credential whose person is bound to a current member of
-- the credential's organization copies that account's rows above, capped at
-- contributor (P12, A23 "acts as member"): both admin roles become
-- `project-contributor` at organization scope, an owner's `package-manager`
-- becomes `package-contributor`, the two contributor and viewer rows copy
-- unchanged. No ELSE, as above.
INSERT INTO `access_grant` (`id`, `organization_id`, `scope_kind`, `scope_id`, `subject_kind`, `subject_id`, `role_id`, `origin`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), g.`organization_id`, g.`scope_kind`, g.`scope_id`, 'machine_credential', c.`id`,
	CASE g.`role_id`
		WHEN 'org-super-admin' THEN 'project-contributor'
		WHEN 'org-admin' THEN 'project-contributor'
		WHEN 'project-contributor' THEN 'project-contributor'
		WHEN 'project-viewer' THEN 'project-viewer'
		WHEN 'package-manager' THEN 'package-contributor'
	END,
	'backfill', (CAST(unixepoch('subsec') * 1000 AS integer)), NULL
FROM `machine_credential` AS c
JOIN `person` AS pe ON pe.`id` = c.`person_id`
JOIN `access_grant` AS g
	ON g.`organization_id` = c.`organization_id` AND g.`subject_kind` = 'user' AND g.`subject_id` = pe.`account_id`
WHERE c.`revoked_at` IS NULL
	AND EXISTS (
		SELECT 1 FROM `organization_membership` AS m
		WHERE m.`organization_id` = c.`organization_id` AND m.`user_id` = pe.`account_id`
	);
