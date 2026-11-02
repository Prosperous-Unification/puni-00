DROP TRIGGER retention_fence_draft_scoping_update;
DROP TRIGGER retention_fence_draft_scoping_insert;
DROP TRIGGER scoping_owner_immutable;
DROP TABLE draft_scoping;
ALTER TABLE conversation_operation DROP COLUMN reply_version;
ALTER TABLE intake_draft DROP COLUMN starting_choice;
ALTER TABLE intake_draft DROP COLUMN start_conversation;
ALTER TABLE intake_draft DROP COLUMN scoping_version;
