ALTER TABLE conversation_operation ADD COLUMN brief_capture TEXT CHECK(brief_capture IN ('marked', 'fallback', 'empty'));
