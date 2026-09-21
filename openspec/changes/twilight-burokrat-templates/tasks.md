## 1. Registry, list, and show

- [x] 1.1 Create the OpenSpec change, template model, three kind templates, `template list`, and `template show` — tests: the four `template registry CLI` cases and the built-executable template assertions; negative: P1 returns the first registered template and `refuses an unregistered template identifier and names every registered template` fails.

## 2. Verify one file

- [x] 2.1 Add the candidate shell and file-scope constraint handlers for `template verify` — tests: the 16 `template verify, one file` cases and two `the template record drives verification` cases; negatives P2-P12, P14, and P22-P24 are watched in slice 3.

## 3. Prove the file-scope checks

- [x] 3.1 Inject P2-P12, P14, and P22-P24 one at a time, compile each fault, observe its named focused test fail, restore exact bytes, and rerun green — tests: each proof's named `templates.test.ts` case.

## 4. Verify one module

- [x] 4.1 Add the module template, module-scope constraint handlers, and delegation to kind templates — tests: the eleven `template verify, one module` cases plus the updated registry listing and unknown-template cases; negatives P13, P15-P21, and P25 are watched in slice 5.

## 5. Prove the module-scope checks

- [x] 5.1 Inject P13, P15-P21, and P25 one at a time, compile each fault, observe its named focused test fail, restore exact bytes, and rerun green — tests: each proof's named `templates.test.ts` case.

## 6. Document and verify the templates

- [ ] 6.1 Document the four templates and command behavior, complete the verification record, and run the focused tests, typecheck, source lint, build, owned-file formatting, repository format check, and strict OpenSpec validation — tests: `templates.test.ts`, `packaging/build.test.ts`, and unchanged `rules.test.ts`; negatives: every P1-P25 proof row is recorded or explicitly pending planner transcription.
