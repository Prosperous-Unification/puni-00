-- Proof: removing the CHECK made the generated-script failing-down test succeed on its first rollback.
CREATE TEMP TABLE `lab_down_guard` (`allowed` integer NOT NULL CHECK (`allowed` = 1));
--> statement-breakpoint
INSERT INTO `lab_down_guard` (`allowed`) SELECT `allowed` FROM `lab_rollback_control` WHERE `id` = 1;
--> statement-breakpoint
DROP TABLE `lab_down_guard`;
--> statement-breakpoint
DROP TABLE `lab_rollback_control`;
