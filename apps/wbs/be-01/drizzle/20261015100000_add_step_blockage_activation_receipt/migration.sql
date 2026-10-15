-- Proof: id, JSON and uniqueness constraints removed separately; independent SQL inserts admitted wrong id, invalid JSON and duplicate receipt (2026-10-15).
CREATE TABLE step_blockage_activation_receipt (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  receipt TEXT NOT NULL CHECK (json_valid(receipt))
);
