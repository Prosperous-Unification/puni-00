CREATE TABLE `browser_credential_revocations` (
	`kind` text NOT NULL CHECK (`kind` IN ('native', 'oidc')),
	`user_id` text NOT NULL CHECK (length(`user_id`) > 0),
	`credential_digest` text NOT NULL CHECK (length(`credential_digest`) = 64 AND `credential_digest` NOT GLOB '*[^0-9a-f]*'),
	`expires_at` integer NOT NULL CHECK (`expires_at` >= 0),
	`revoked_at` integer NOT NULL CHECK (`revoked_at` >= 0),
	PRIMARY KEY (`kind`, `user_id`, `credential_digest`)
);
