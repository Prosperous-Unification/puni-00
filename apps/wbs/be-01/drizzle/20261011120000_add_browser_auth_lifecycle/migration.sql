CREATE TABLE `browser_auth_lifecycle` (
	`session_digest` text PRIMARY KEY NOT NULL CHECK (length(`session_digest`) = 64 AND `session_digest` NOT GLOB '*[^0-9a-f]*'),
	`user_id` text NOT NULL CHECK (length(`user_id`) > 0),
	`generation` integer NOT NULL CHECK (`generation` > 0),
	`state` text NOT NULL CHECK (`state` IN ('active', 'closed')),
	`current_kind` text NOT NULL CHECK (`current_kind` = 'oidc'),
	`current_digest` text NOT NULL CHECK (length(`current_digest`) = 64 AND `current_digest` NOT GLOB '*[^0-9a-f]*'),
	`current_expires_at` integer NOT NULL CHECK (`current_expires_at` >= 0)
);
--> statement-breakpoint
CREATE TABLE `browser_auth_association` (
	`session_digest` text NOT NULL REFERENCES `browser_auth_lifecycle`(`session_digest`),
	`generation` integer NOT NULL CHECK (`generation` > 0),
	`kind` text NOT NULL CHECK (`kind` = 'oidc'),
	`credential_digest` text NOT NULL CHECK (length(`credential_digest`) = 64 AND `credential_digest` NOT GLOB '*[^0-9a-f]*'),
	`expires_at` integer NOT NULL CHECK (`expires_at` >= 0),
	PRIMARY KEY (`session_digest`, `generation`),
	UNIQUE (`kind`, `credential_digest`)
);
