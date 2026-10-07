CREATE TABLE `delegation_use` (
	`issuer` text NOT NULL,
	`jti` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY (`issuer`, `jti`)
);
--> statement-breakpoint
CREATE INDEX `delegation_use_expires_at` ON `delegation_use` (`expires_at`);
