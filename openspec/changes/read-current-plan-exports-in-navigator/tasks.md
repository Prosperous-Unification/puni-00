## 1. Current wire and task contracts

- [x] 1.1 Generate a mixed-unit v8 fixture using the WBS exporter; accept it with schema-2 native estimates and a Burokrat-decodable reference — test: writes native minute and workday estimates; negatives: pin restored, unit omitted, future v9, unknown keys.
- [x] 1.2 Preserve v7 preparation and historical schema-1 decoding — tests: writes a decodable plan reference and tasks export; historical task export keeps its digest.

## 2. Receipt compatibility and evidence

- [x] 2.1 Convert schema-2 receipts without estimate normalization — tests: current task export emits commands; negative: tampered native unit or value and unknown task key fail before output.
- [x] 2.2 Record focused checks and mutation proofs, update CLI documentation, and commit the isolated packet for review.
