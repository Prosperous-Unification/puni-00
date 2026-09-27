DROP INDEX submission_replay_request;
ALTER TABLE submission_replay DROP COLUMN request_id;
DROP INDEX provider_call_request;
ALTER TABLE provider_call DROP COLUMN request_id;
DROP TABLE request_concept_preview;
DROP INDEX chat_turn_request;
ALTER TABLE chat_turn DROP COLUMN request_id;
DROP INDEX software_request_active_account;
DROP TABLE software_request;
