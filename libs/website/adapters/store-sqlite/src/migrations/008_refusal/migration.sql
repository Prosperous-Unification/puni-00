-- Additive: blue and green share this file mid-swap, and the outgoing release never names the column.
-- Proof: without `AND state = 'completed'`, the refusal-on-an-uncompleted-operation store test updated the row.
ALTER TABLE conversation_operation ADD COLUMN refusal TEXT CHECK(refusal IS NULL OR (refusal IN ('content_filter', 'provider_refusal') AND state = 'completed'));
