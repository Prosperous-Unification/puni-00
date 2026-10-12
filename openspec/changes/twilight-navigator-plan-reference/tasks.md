## 1. Record kinds in Burokrat's contracts

- [x] 1.1 Red then green: `PlanReferenceRecord` and `ProgressReceiptRecord` v1 in `contracts/navigator-records.ts`, both in `RecordKind` and `decodeRecord`. Tests (`contracts/navigator-records.test.ts`): decodes both; refuses an undeclared key, a wrong schema version, a non-hex digest, an empty entry list, an unknown status; the kind set is exactly the documented list. R5: drop undeclared-key rejection on one record and watch the undeclared-key case decode; remove `plan-reference` from `RecordKind` and watch the kind-set and production `validate` cases fail.
- [x] 1.2 Red then green: `contracts/canonical.ts` with canonical JSON, `digestOf` and `verifyDigest`. Tests (`contracts/canonical.test.ts`): byte-stable across key order; a changed field changes the digest; `verifyDigest` refuses a tampered record. R5: skip the digest comparison and watch the tamper case pass.

## 2. `twin plan-reference`

- [x] 2.1 Red then green: the `twilight-navigator` app (`project.json`, tsconfigs, `src/cli.ts`, `src/entrypoint.ts`, `src/plan-reference.ts`), `eslint.product.mjs`, the `@twilight-burokrat/contracts` alias, and tool-devsync registration (name exception, product inventory, graph edges, restart paths, effective lint boundary). Initial tests used a v6 export fixture produced by WBS's own exporter (historical provenance; the current fixture and Navigator pin are v7, as recorded in `verify.md`): writes a decodable plan reference and task export; initially refuses version 5 before writing (the current v7 pin refuses versions 6 and 8); refuses an existing output file; refuses missing, unreadable and malformed export and requirements files separately; identical inputs give identical bytes. R5: write before the version check; replace exclusive create with overwrite; collapse missing into unreadable.
- [x] 2.2 Red then green: `cli.test.ts` proves exact dispatch, exit 2 and no file for an unknown command, unknown, duplicate, missing or valueless flag. R5: forward unknown flags and watch the refusal fail.
- [x] 2.3 README with the command, "prepared, not applied", and the Navigator→Dash direction; one `LLM_README.md` line beside Dash's.

## 3. `twin receipt-to-commands`

- [x] 3.1 Red then green: `src/receipt-to-commands.ts`. Tests: emits commands per entry in order; refuses a receipt for another plan reference; refuses an unknown task or step before writing; refuses a tampered receipt, plan reference or task export; the batch validates against the `postApiProjectsByIdCommands` params and body shapes. R5: skip the `planRef` equality; skip the task lookup; skip the task-export digest binding.
- [x] 3.2 `cli.test.ts`: both commands dispatch and the usage text lists exactly two.

## 4. Acceptance

- [x] 4.1 Record observed commands and R5 proofs in `verify.md`: `twilight-navigator` test/lint/typecheck, Burokrat test/lint:source/typecheck, tool-devsync tests, Burokrat `check-indexes`, OpenSpec validation, Prettier.
- [ ] 4.2 Host gate on the exact head (orchestrator).
