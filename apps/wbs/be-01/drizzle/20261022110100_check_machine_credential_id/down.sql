-- Reverses `20261022110100_check_machine_credential_id`. Dropping the two
-- triggers loses no row and no evidence, so nothing guards it.
DROP TRIGGER `machine_credential_id_shape_update`;
--> statement-breakpoint
DROP TRIGGER `machine_credential_id_shape_insert`;
