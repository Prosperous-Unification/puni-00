# Historical planning artifacts

Published copies prepared for WBS 080.18 under the 2026-09-21 decision to make
both artifacts public after a full content review. Reviewed for privacy and
fidelity against the private originals on 2026-10-11 (Fable 5.1); the review
record is in the puni-plan repository, `batch-10/lanes/public-artifacts-080-18.md`.
These files do not describe the current product contract.

- [August manual UI testing plan](2026-08-11-manual-ui-testing-plan.md): the
  original 49 cases, execution notes and dated corrections. The source basename
  was `wbs-manual-tests-2026-08-11.md`.
- [Economics calculator](../../twilight-structure/research/unit-economics/factory-unit-economics.html):
  the 2026-09-08 standalone HTML; its status is described in the
  [unit economics note](../../twilight-structure/research/unit-economics/README.md).

Sanitization replaces personal names with operator/product-owner references and
synthetic person-a/person-b/person-c labels, replaces the private scratch-project
prefix with `ui probe`, removes the local checkout path, and replaces historical
authentication-location instructions with an authorized test-instance procedure.
No original account, customer records, credentials, screenshots or local source
paths are included.

Verification before publication:

- All 49 case IDs preserved in their original order.
- Calculator JavaScript unchanged after formatting: the single `<script>` body
  extracted from the original and from the published HTML, transpiled with
  `bun build --no-bundle` and stripped of whitespace, is byte-identical in both
  (SHA-256 `4ca890e8ee9902c90afa28402dc17af56bc8fdbd4c57b5603857e915b02e4afc`
  with Bun 1.4.2). For each file:

  ```sh
  awk '/<script>/{on=1;next} /<\/script>/{on=0} on' factory-unit-economics.html > calculator.js
  bun build --no-bundle calculator.js | tr -d '[:space:]' | sha256sum
  ```

- Bun/jsdom execution was unavailable: `Proxy is not allowed in the global
prototype chain`. Its empty-output comparison is invalid and not evidence.
- Chromium 153.0.8010.12: 22 comparisons of original and published outputs passed
  (defaults, all 15 serving scenarios, and six slider changes), with external
  requests blocked. Default medium-feature p50 displays `$15.53`.
- The historical UI cases have not been rerun.

OpenSpec is skipped under AGENTS.md's rule that it is skipped "for docs,
mechanical refactors and fixes restoring a precise spec". The publication adds
no product behavior, deployment, migration or safety check.
