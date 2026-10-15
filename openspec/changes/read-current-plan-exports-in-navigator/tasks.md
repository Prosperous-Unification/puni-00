## 1. Current wire and task contracts

- [x] 1.1 Generate a mixed-unit v8 fixture using the WBS exporter; accept it with schema-2 native estimates and a Burokrat-decodable reference — test: writes native minute and workday estimates; negatives: pin restored, unit omitted, future v9, unknown keys.
- [x] 1.2 Preserve v7 preparation and historical schema-1 decoding — tests: writes a decodable plan reference and tasks export; historical task export keeps its digest.

## 2. Receipt compatibility and evidence

- [x] 2.1 Convert schema-2 receipts without estimate normalization — tests: current task export emits commands; negative: tampered native unit or value and unknown task key fail before output.
- [x] 2.2 Record focused checks and mutation proofs, update CLI documentation, and commit the isolated packet for review.

## 3. Strict v9 read and receipt (WBS080.25)

- [x] 3.1 Generate a real nonempty mixed-unit v9 export; test empty and retained done/negative facts, raw hashing and blockedAt-only identity changes.
- [x] 3.2 Add narrow strict v9 boundary validation; prove refusal of unknown keys, future versions, missing facts, missing/nonleaf owners, unknown steps, duplicate pairs and unsafe timestamps through production paths.
- [x] 3.3 Admit v9/schema2 in Burokrat, both consistency commands and receipt conversion; refuse re-digested v9/schema1 and v10, retaining historical behavior.
- [x] 3.4 Exercise packaged external consumer; update CLI docs, record focused verification and watched mutation proofs.
