## 1. Spell and resolve ordinal-first references

- [x] 1.1 Change the shared formatter to use the one-based step ordinal padded to the width of the project step count; make the resolver return that spelling while retaining code-only and ordinal input and all current refusals. Update existing expectations in `libs/wbs/domain/domain/src/step-reference.test.ts`; CI runs that suite. No new tests or local test runs per developer instruction.

## 2. Use one spelling across reads and exports

- [x] 2.1 Pass ordered step indices and project step count into the formatter from the work-item address read and plan-document export. Update existing expectations in `libs/wbs/application/core/src/module/work-item/step-addresses.test.ts`, mounted controller/FE tests and plan-document tests; CI runs those suites. Keep copied links keyed by step-node ID.

## 3. Record and gate the release

- [ ] 3.1 Update Step reference in `CONTEXT.md`, related JSDoc and OpenSpec; validate the change and record actual CI output in `verify.md`. Do not merge until the padded-alias parser release is deployed to production and older be-01 instances have drained. Evidence: OpenSpec validation and PR checks; the production prerequisite requires an external deployment observation.
