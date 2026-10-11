CREATE TABLE `lab_rollback_control` (`id` integer PRIMARY KEY, `allowed` integer NOT NULL);
--> statement-breakpoint
INSERT INTO `lab_rollback_control` (`id`, `allowed`) VALUES (1, 0);
