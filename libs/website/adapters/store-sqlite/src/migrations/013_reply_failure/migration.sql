-- Proof: removing this CHECK admitted corrupt failure codes, version-1 failures and unsettled failures in scoping-reply-store.test.ts.
ALTER TABLE conversation_operation ADD COLUMN reply_failure TEXT CHECK(reply_failure IS NULL OR (reply_failure = 'invalid_scoping_reply' AND state = 'completed' AND settlement = 'usage' AND reply_version IS NULL));
