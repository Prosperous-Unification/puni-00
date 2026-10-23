# Twilight Burokrat

<!-- module-index {"schemaVersion":1,"moduleId":"module.infra.tool-wiki","memberships":[{"kind":"directory-prefix","prefix":"src","exclusions":[]},{"kind":"directory-prefix","prefix":"fixtures","exclusions":[]},{"kind":"path","path":"project.json"},{"kind":"path","path":"package.json"},{"kind":"path","path":"LICENSE"},{"kind":"path","path":"NOTICE"},{"kind":"path","path":"tsconfig.json"},{"kind":"path","path":"tsconfig.lib.json"},{"kind":"path","path":"tsconfig.spec.json"}],"relationshipSelectors":["declarations.facts","typescript.imports","typescript.reverse-edges"],"applicableChecks":["check.wiki-cli.test","check.wiki-cli.lint-source","check.wiki-cli.typecheck"],"inapplicableSections":[],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"bin/tool-wiki-lint.sh"},{"kind":"path","path":"bin/h2puni-gate.sh"},{"kind":"path","path":".github/workflows/trusted-wiki.yml"},{"kind":"path","path":".github/workflows/ci.yml"},{"kind":"path","path":"lefthook.yml"},{"kind":"path","path":"nx.json"}],"knowledgeLimit":"Only the launcher, host gate, trusted workflow, candidate CI workflow, hook, and Nx callers needed by the bootstrap activation are declared; their surrounding directories are not claimed as reviewed."}} -->

This project owns the finite Twilight Burokrat ledger, trusted policy and activation logic, review
provenance, and the admission judge: packet codec and validation, integration-candidate
certification and attestation, exposed to Twilight Dash only through
[`judge-facade.ts`](src/judge-facade.ts). The runtime lease authority that records claims and
publishes is [Twilight Dash](../../twilight-dash/cli/README.md); Burokrat ships no authority
writer. The activation controller, its observation service and the review invoker's runtime moved
to Dash as well
([ADR 0051](../../../../docs/adr/0051-the-activation-controller-runs-in-dash-as-a-second-authority.md)).
Burokrat keeps the invocation journal records with `validate-review-provenance`
([`review/invocation-journal.ts`](src/review/invocation-journal.ts)). Twilight Dash runs the
activation checks (`twilight-dash run-activation-checks`); both preparers judge the CheckRun
ledger it writes ([`policy/check-runs.ts`](src/policy/check-runs.ts),
[ADR 0052](../../../../docs/adr/0052-dash-runs-activation-checks-and-burokrat-judges-their-receipts.md)),
so the package reads no clock. The index covers source, tests, fixtures, and project
configuration as one initial enforced tooling boundary. It does not claim exhaustive repository
coverage; the six historical pilot modules remain named review debt outside this boundary.

Version-1 record IDs, module IDs, role filenames, and `TOOL_WIKI_*`
environment variables retain their legacy spelling so existing evidence and
immutable activations keep their identity.

## Checks

The bootstrap obligation requires the uncached `twilight-burokrat:test`,
`twilight-burokrat:lint:source`, and `twilight-burokrat:typecheck` Nx
targets declared in [project.json](project.json). The diagnostic
`twilight-burokrat:lint` target cannot certify itself and is not one of
these receipts.

## Rules

`check` evaluates the registered rules over one candidate and prints a verdict. `explain` prints a
rule's registry record and, when given a rule policy, its stated mode. A rule policy is read from
outside the candidate's Git worktree so the candidate cannot select the policy that judges it. A
verdict never certifies. In slice B0, a rule that cannot be evaluated disallows the verdict in every
mode.

Rules are grouped by family. The modules family checks index declarations, the direct-entry limit
and the module layout. The relationships family checks the kind direction rules K2 to K6 on the
import graph the package extracts, which resolves path aliases and follows re-exports, so a barrel
cannot hide the kind of the file behind it. A file's kind comes from its filename suffix, from a
module `view` directory, or from the kind inventory a rule policy may name as `kindInventory`. The
inventory is read from the selected candidate, not the checkout; a missing, malformed, duplicated,
stale or suffix-contradicting inventory leaves every rule that reads kinds unevaluated. The code-shape family checks F1, that a service, store
or geometry module is plain TypeScript, and F7, the file size ratchet. A rule in ratchet mode
refuses a finding inside the consumer's adopted set and reports one outside it as debt; refusing
because a file was touched needs a comparison base the verdict records, which this package does not
yet take.

The package installs two commands for the same program: `twilight-burokrat`, which documentation
uses, and the short form `twib`.

## Diagnostic test reports

`inspect-test-reports <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable>`
reads one existing Browser publication under an external policy pin. It joins every observed case
to a regular test-file blob in the selected commit and emits stable case and observation digests,
the actual passed/failed/skipped outcomes, and the selected source mode and content digest.
It does not run tests or resolve scenario citations. The observation has absent authentication,
`certifies:false`, and no coverage or admission credit. A zero exit means that inspection
completed, even when a case failed or was skipped. The command retains the Browser inspector's
policy, publication, discovery and report refusals.

`inspect-browser-memberships <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>`
binds the real report observation to strict external version-1 review facts. The authority pins
`revision`, `candidate`, `mode` and `reportObservationDigest`, and lists exactly four
`memberships`: each has `level` (`manual`, `conformance`, `architecture`, `performance`) and
`kind` (`unknown` or `reviewed-empty`). Each assertion covers the complete recorded Browser
fixture collection. Unknown remains an evidence gap; reviewed-empty records an external review
assertion. The output retains the complete report, sorted unique collection and review rows,
raw authority digest and full-envelope digest. These facts neither discover membership nor
classify a test, establish isolation or grant T1/T2, coverage or admission credit. Authentication
is absent and `certifies:false`; failed and skipped cases remain observations.

`inspect-browser-conformance <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>`
binds the real report to a complete committed Conformance selection in one externally declared
project root. The closed version-1 authority pins `revision`, `candidate`, `mode`,
`reportObservationDigest`, `projectRoot` and `projectManifest:{path,digest}`. Version 1 retains
its exact committed-selection observation bytes. A closed version-2 authority retains those pins
and requires `conformance:{kind:'committed'}` or `{kind:'reviewed-empty'}`. Reviewed-empty is
an external review assertion over the complete collection; its selected manifest must have valid
object-valued `targets` with no own `test:conformance` property. Every present value, including
null, false or an unsupported envelope, contradicts that assertion. Missing, malformed or
unreadable selected state refuses. Its membership is exactly `{kind:'reviewed-empty'}` and its
source union retains every Browser source and the manifest. An explicit committed selection with
no overlap remains committed with an empty intersection. Every Browser file
must lie inside that root; the manifest must be its `project.json`. Only the existing bounded
literal Bun Conformance command is supported. Every selected source is validated before the
intersection, including disjoint files. Output retains the full report, complete selection,
sorted intersection and source union. Manual, Architecture and Performance remain unknown.
Authentication is absent and `certifies:false`; no classification, isolation, execution,
coverage or admission claim follows. Failed and skipped Browser outcomes remain observations.

`inspect-browser-source-levels <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority>`
composes the real Browser source owner and level inspectors for the same committed snapshot.
It requires exact case IDs, files, outcomes, source tuples, report identity and complete level
membership, then rereads the publication to refuse drift. Full upstream observations, module
index review debt and typed isolation remain visible. Wrong-level emits JSON and exits one;
isolated observations exit zero even with failed/skipped outcomes. A source owner identifies
the test file's module; it supplies no tested-module claim, T2, coverage or admission authority.
Authentication stays absent and certification false. Existing source and level commands retain
their v1 output.

`inspect-browser-levels <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority>`
joins the real Browser Memberships and three source adapters for one exact committed candidate,
mode and complete collection. The generic review must explicitly mark Manual reviewed-empty
and the other three rows unknown. Conformance, Architecture and Performance memberships come
from their real adapters. Matching report/envelope digests, complete collections, project and
manifest pins and overlapping source tuples are required. A final real report read refuses
publication changes during composition. The output retains all four observations and digests,
complete sorted collection and source union, per-file bindings and Browser isolation. Shared
first-match classification gives Conformance precedence over Architecture, then Performance;
only an admitted collection member without an earlier match becomes Browser. Isolated exits
zero; valid wrong-level findings emit complete JSON and exit one. Refusals emit no JSON.
All passed, failed and skipped outcomes remain observations. Authentication is absent and
`certifies:false`; this diagnostic grants no T2, scenario coverage or admission.

`inspect-browser-architecture <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <external-authority>`
binds the complete report to one project's explicit reviewed-empty assertion or complete committed
Architecture selection. Its closed version-1 authority pins `revision`, `candidate`, `mode`,
`reportObservationDigest`, `projectRoot`, `projectManifest:{path,digest}` and
`architecture:{kind:'reviewed-empty'}` or `{kind:'committed',path,digest}`. The manifest is the
root's `project.json`; the policy is its `src/architecture-fixtures.json`. All mapped selected
regular blobs are checked before intersection through the existing rule and immediate-child
discovery validators. Reviewed-empty refuses a fixed policy, any policy descendant or a declared
`test:architecture:level`. Output includes the complete report, authority and raw-byte digest,
sorted collection, complete selection, intersection and deduplicated source union. Manual,
Conformance and Performance remain unknown, authentication absent and `certifies:false`.

`inspect-test-sources <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable>`
joins those observed Browser case files to their exact validated module indexes in the same
selected commit. It reports the source owner, source and index identities, index review debt, and
an explicitly unresolved test level. Source ownership does not establish the module tested by a
case. The observation remains unauthenticated, noncertifying, and carries no coverage or admission
credit.

Browser Performance version-1 authority retains committed declaration/config/project pins.
Version 2 moves those pins into `performance:{kind:'committed',declaration,config,project}`
or explicitly asserts `performance:{kind:'reviewed-empty'}`. Empty membership validates the
selected manifest and complete Browser sources, refusing any own `test:performance` or
`test:performance:level` target and any selected entry at or below the fixed
`<projectRoot>/performance-cases.json` path. Working-tree repairs cannot alter selected state.
It emits no Performance execution claim; unrelated memberships remain unknown and certification false.

`inspect-performance <repository> <committed-sha> <external-rule-policy>` inspects the
current immutable Performance publication. It binds committed declaration, config and fixture
blobs to the external Performance policy; recomputes artifact digests; independently decodes
raw discovery, execution and measured attachments; evaluates reviewed thresholds; and reconciles
normalized JUnit identities, counts and outcomes. It refuses inconsistent or unsuccessful
success publications and pointer changes. Historical checkout paths are normalized as report
identities without filesystem access. The deterministic observation digest binds all emitted
claims, including authentication absent and `certifies:false`. It runs no tests and awards no
coverage or admission credit. Historical failure bundles remain diagnostics.

`inspect-performance-sources <repository> <committed-sha> <external-rule-policy>`
joins cases from that current-success publication to their exact selected fixture blobs and
unique validated module-index owners in the same commit. It retains the comparison judgment,
publication and index identities, and index review debt. Every case has an unresolved test level;
the observation has absent authentication, `certifies:false`, and no tested-module, coverage or
admission claim. A refused Performance publication remains a refusal.

`inspect-level-facts <repository> <committed-sha> <external-authority>` observes one complete
Performance declaration and its exact selected fixture blobs under an external version-1
authority. The authority pins the commit, candidate, project manifest, declaration, config,
Playwright project and fixture set. In this first slice, Manual, Conformance and Architecture
must each be explicitly reviewed empty for that fixture scope; a present Conformance target
contradicts that assertion. Committed Conformance and Architecture sources await their bounded
adapters. The output binds source tuples and explicit membership states with absent
authentication and `certifies:false`; it does not classify tests, read the publication or award
coverage.

`inspect-manual-observation <repository> <committed-sha> <external-rule-policy> <report-path> --now <UTC instant>`
wraps the complete `inspect-manual` result with the exact committed candidate identity and
canonical evaluation instant. The digest binds the entire envelope, including the nested Manual
verdict, absent authentication and `certifies:false`. Current, stale, failed and overdue results
all emit JSON; only current exits zero. Invalid evidence and unresolved scenario selection refuse
without JSON. The command grants no Manual-level, coverage, admission or human-authentication claim.

## Diagnostic specification sources

`inspect-spec-sources <repository> <committed-sha>` inventories every parsed active canonical
requirement and overlay operation in one committed selection. It binds source bytes, raw
requirement and rename fragments, explicit rename endpoints, scenarios and candidate identity in
a deterministic observation digest. Competing valid operations remain visible together; the
production selector continues to refuse unresolved lineage. Malformed or unreadable active
sources refuse. The diagnostic emits `certifies:false`; predecessor acceptance and source
synchronization require reviewed reconciliation evidence.

## Trust boundary

Candidate changes can propose future validator or policy bytes, but they cannot select the
activation that evaluates the same candidate. Immutable activation packages and final integration
bindings are created and retained outside the candidate tree.

## Package release

`twilight-burokrat-vMAJOR.MINOR.PATCH` tags drive the protected package-release workflow. It
tests the installed tarball outside this checkout, records its SHA-256 and npm integrity, transfers
the same file between jobs, verifies it again, and runs a registry dry run before publication. The
package is distributed under the MIT License ([LICENSE](./LICENSE)). The registry name, protected
environment and token are external prerequisites. Operational details
live in [the activation runbook](../../../../docs/runbook-tool-wiki-activation.md#release).

## Experiment evidence

`experiments/export.ts` accepts a complete journal and its reconciled report, then emits canonical
JSONL observations followed by two RFC 4180-compatible tables. JSONL uses one object per trial,
session, outcome, attempt, invocation receipt, elapsed receipt, and infrastructure allocation; every
object carries `trialId`, `manifestId`, `manifestIdentity`, `corpusId`, and `acceptanceId`. The trial
observation embeds the strict manifest, so its canonical identity and pinned conditions remain
resolvable without a separate Tool Wiki installation. The outcome CSV columns are
`trial_id,outcome_id,title,status,attempt_count,defect_count`. The trial CSV columns are
`trial_id,manifest_id,manifest_identity,corpus_id,acceptance_id,concurrency,status,accepted_outcome_count,outcome_count,total_elapsed_ms,aggregate_session_elapsed_ms,currency_charges`;
charges are sorted `CURRENCY:micros` pairs separated by semicolons. The raw observations let an
independent reader recompute accepted outcomes, trial and session elapsed totals, phase totals, and
verified charges, including failed and censored work.

## Exhaustive census

`freeze-exhaustive` derives file, ancestor-directory, Nx/non-Nx project, and documentation
obligations from an immutable commit after exact inventory, classification, relationship, mapping,
model/context, protocol, and evidence-graph joins. `verify-exhaustive` independently rereads that
commit; `evaluate-exhaustive-coverage` replaces submitted population claims with the frozen full
set before audit evaluation. Evidence payload bytes remain confined to evidence-graph validation,
and any declared Gitlink that is still inaccessible is retained in the coverage report and blocks
acceptance. These commands validate a proposed sweep record. They do not run reviews, activate
policy, or certify the still-pending operational sweep.

## Plan and progress receipt consistency

`twib validate-progress-receipt <receipt.json> <plan-reference.json> <tasks.json>` strictly
checks three supplied documents with [`validateProgressReceipt`](src/contracts/validate-progress-receipt.ts).
Its deterministic `progress-receipt-consistency` JSON names their digests, plan and entry count.
It checks existing plan/task consistency, the complete plan reference and each receipt entry's
leaf task ID and step code membership. Navigator reuses `checkProgressReceiptConsistency` before
constructing commands. The report grants no certification, authorship, freshness, evidence
authority, approval, admission or authority over current WBS state. Historical v6/v7/v8 references
remain supported; v9 and v10 require task schema 2 and v11 is refused. Schema 1 receipts bind the six-field
PlanRef. Schema 2 receipts additionally bind referenceDigest, which must match the supplied plan
reference. Neither establishes live WBS freshness. Missing, unreadable, malformed and inconsistent
inputs fail with no success stdout. This command reads files only.

`twib validate-plan-tasks <plan-reference.json> <tasks.json>` strictly checks the two supplied
documents using [`validatePlanTasks`](src/contracts/validate-plan-tasks.ts). Its deterministic
`plan-task-consistency` report names the reference digest, canonical task digest, plan and task
count. It checks historical/current schema pairing and unique task IDs and step IDs/codes.
This report grants no approval, admission, certification, requirements validation or composite
dependency closure.

`twilight-burokrat inspect-performance-scenarios <repository> <committed-sha> <external-rule-policy> <external-level-authority> <capability>` joins the validated isolated Performance publication to the entire selected B3 active tree under the external policy's pinned predecessor. Each adopted requested scenario lists passing selected case IDs or `unobserved-in-selection`. Only terminal test-title `[CAPABILITY-001] ` prefixes cite scenarios. Missing/malformed prefixes and unknown/retired identities produce separate citation findings and exit 1; source, policy, isolation or B3 refusals emit no JSON. The full observation preserves unrelated B3 debt and binds all upstream identities. It remains unauthenticated and noncertifying; an unobserved row says nothing about tests outside this selection.

`twilight-burokrat inspect-scenario-ledger <repository> <committed-sha> <external-rule-policy> <external-level-authority> <capability> <external-ledger-authority> --now <UTC instant>` enumerates every adopted effective scenario in the selected capability and joins a closed external obligation authority. It preserves the complete Performance/B3 observation, citation findings and unidentified debt. Missing obligations are named `unassigned`; unsupported automated lowest levels remain debt; inapplicability requires a reason; Manual obligations retain the existing inspector's exact current/stale/failed/overdue observation. Valid debt emits JSON and exits 1. Authority/evidence/join refusals emit no partial JSON. The canonical full-payload digest binds normalized obligations, upstream observations and evaluation instant. Authentication is absent and certification is false; this diagnostic does not grant coverage or admission.

Version 2 of the closed ledger authority additionally requires `browser:{mode,reviewAuthorityPath,conformanceAuthorityPath,architectureAuthorityPath,performanceAuthorityPath,observationDigest}`. The four paths must be canonical absolute external files. The command always reads real Browser scenarios and the mandatory Performance input, joins complete B3 reports and exact nested identities before obligations, and emits schema 2 with both complete observations. Only Browser lowest-level obligations use Browser cases: all passed is passing, any failed is failed, otherwise any skipped is skipped; absent remains unobserved. Failed, skipped and absent observations remain debt. Both citation sources are labelled, shared unidentified B3 debt appears once, and the complete payload remains noncertifying. Version 1 retains its existing envelope and behavior.

`inspect-browser-scenarios <repository> <committed-sha> <external-rule-policy> <ordinary|packaged|portable> <review-authority> <conformance-authority> <architecture-authority> <performance-authority> <capability>` joins real isolated Browser levels and whole-tree B3 specifications. Requested adopted scenarios retain complete passed/failed/skipped cases or `unobserved-in-selection`; all active citations, including other capabilities, remain visible. Only terminal title prefixes cite scenarios. Invalid citations produce JSON findings and exit 1, while unobserved rows alone exit 0. Authority, identity, digest, isolation or B3 refusals emit stderr without JSON. Full nested reports and policy identity remain diagnostic, authentication absent and `certifies:false`; no candidate files execute and no coverage or admission follows.

`twilight-burokrat inspect-browser-scenario-ledger <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> --now <UTC-instant>` is the Browser-only capability diagnostic. Its closed schema-1 external authority contains `revision`, `candidate`, `capability`, `browser` (`mode`, `reviewAuthorityPath`, `conformanceAuthorityPath`, `architectureAuthorityPath`, `performanceAuthorityPath`, `observationDigest`) and `obligations` with the existing automated/inapplicable/manual dispositions. All four Browser membership authorities remain mandatory, including Performance membership. Separate Performance execution publications and level authorities are unnecessary. The existing `inspect-scenario-ledger` v1/v2 contracts retain mandatory Performance execution evidence.

The Browser-only ledger joins the real isolated Browser scenario observation to the complete committed B3 selection before assigning requested rows. Only automated `lowestSufficientLevel: "browser"` receives Browser evidence; other automated levels remain unsupported debt. Passed/failed/skipped cases, absent observations, unassigned rows, explicit inapplicable reasons, real pinned Manual observations, Browser-labelled citation debt and unrelated B3 debt remain visible. Valid debt emits complete JSON with exit 1; invalid authority/evidence joins refuse without JSON. Authentication remains absent, certification remains false, and the canonical digest binds the complete observation. This command does not establish coverage or admission and does not close WBS080.39.

`twilight-burokrat inspect-browser-t2 <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> --now <UTC-instant>` consumes the real Browser-only ledger as a noncertifying T2 citation diagnostic. It retains the complete ledger and its debt, exact selection/instant/publication scope, policy identity, complete original citation findings and full canonical digest. Every source-bound Browser report case appears exactly once in canonical case-ID order as `{case, citation}`; citation is `{kind:'cited',scenarioId}` or `{kind:'missing'|'malformed'|'inactive'}`. Active citations in other capabilities remain cited. Missing, duplicate, conflicting, foreign or altered partition cases and invalid ledger joins refuse with stderr and no JSON. Valid diagnostics exit zero even with citation findings, failed/skipped outcomes or ledger debt. The command grants no admission or coverage authority and does not register T2 in RulePolicy. Required external authorities and explicit UTC instant retain the Browser-only ledger's strict boundaries.

`twilight-burokrat inspect-browser-t2-policy <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> <external-proposed-policy> --now <UTC-instant>` previews citation effects over the real complete Browser T2 observation. The closed schema-one `proposed-browser-citation-policy` binds revision, candidate, capability, canonical evaluatedAt, rulePolicyDigest and browserT2ObservationDigest. Its disposition is observe/enforce, or ratchet with explicit unique canonical relative adoptedPrefixes (empty and overlapping distinct prefixes are valid). The regular external proposal must have a canonical absolute path outside the candidate, with no symlink components. Raw captured bytes and the decoded proposal are retained; neither location nor digest authenticates it. Missing/malformed/inactive citations become debt under observe, refusal under enforce, and refusal exactly at or beneath an adopted prefix under ratchet. Every original case and all ledger debt remain visible. Complete diagnostic JSON exits one only for proposed citation refusals, otherwise zero even with failed/skipped outcomes and debt. Invalid input or inconsistent upstream state refuses with stderr and no JSON. Authentication remains absent and certification false. This command registers no rule and grants no admission, execution, coverage or tested-module authority.
