CREATE TABLE `email_challenge` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `email` text NOT NULL,
  `token_digest` text NOT NULL,
  `expires_at` integer NOT NULL,
  -- Proof: 2026-09-28, removing the state CHECK failed `challenge schema rejects duplicate digests and unknown delivery states`.
  `delivery_state` text NOT NULL CHECK (`delivery_state` IN ('pending', 'delivered', 'failed')),
  `consumed_at` integer,
  `revoked_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
-- Proof: 2026-09-28, replacing UNIQUE with a plain index failed `challenge schema rejects duplicate digests and unknown delivery states`.
CREATE UNIQUE INDEX `email_challenge_token_digest` ON `email_challenge` (`token_digest`);
