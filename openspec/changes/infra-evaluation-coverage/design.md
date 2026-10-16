## Context

The [coverage research](../../../docs/infra/research/2026-10-16-burokrat-coverage.md)
distinguishes 262 committed infrastructure blobs from unsupported infrastructure
semantics. `readCandidate` already freezes complete path/mode/object tuples;
`loadRulePolicyWithIdentity` validates external bytes and every registry mode;
`checkCandidate` produces whole-rule observations, findings and unevaluated reasons.
Its current internal index outcome establishes nearest-index membership and direct
entry declarations but is not part of the public verdict.

## Goals / Non-Goals

Produce a separate diagnostic with exact identity joins and every selected
subject crossed with every registered rule. Preserve the public check verdict.
Keep native checks, admission, certification and live state outside this report.

## Decisions

The command accepts four operands and no options. It requires the exact full
committed SHA. The supplied identity must equal Git's resolved commit identity;
a full annotated-tag object SHA cannot stand in for its peeled target. Both authority files use the existing external stable-read
boundary; missing, unreadable, malformed or candidate-contained authority throws
before stdout. External review uses a strict version 1 schema with these fields:

- `candidate`: full revision, tree and candidate snapshot digest.
- `inventory`: complete ordered committed path/mode/object tuples.
- `selectors`: reviewed nonempty path/prefix scope using the existing content
  selector semantics; each selector must resolve at least one committed tuple.
- `subjects`: explicit, unique tuples exactly equal to selector expansion over
  complete inventory, in candidate order. Omitting YAML or an extensionless
  executable selected by the scope refuses even when inventory stays complete.
- `policyDigest`: exact external policy bytes; `adoptedSetDigest`: canonical hash
  of the policy's explicitly present adopted set, including the empty set.
- `registryDigest`: canonical hash of sorted public registry contracts and each
  policy mode; `runtimeDigest`: actual executed runtime artifact identity.
- `exclusions`: unique exact path/mode/object subject and rule pairs with a registry-supported
  reason code, nonempty explanation, reviewer and reference. F7 permits
  `outside-size-input` only when the mode/path/root predicate excludes the tuple;
  MOD-DIRECT-ENTRIES permits `not-index-declaration` only when the successful
  index report proves the tuple is not an index. Unadapted rules permit no
  exclusions. Review cannot state evaluation or replace engine outcomes.

Extract internal check execution to return the candidate, validated policy
identity, index outcome and verdict. Existing `checkCandidate` returns only that
verdict. The diagnostic uses the same execution once, preventing duplicate policy
reads and graph evaluations. Export the canonical candidate digest rather than
introducing a second identity algorithm. Runtime identity is derived from the actual entry dependency closure in source
mode or the actual executed validator bundle and its remaining imports in
packaged mode, including configured trusted runtime module bytes. It includes runtime version and executable bytes;
review-supplied labels never stand in for runtime identity.

Generate the Cartesian matrix internally in stable candidate/registry order.
Each row carries its exact subject tuple, rule contract, ruleMode, applicability,
evaluation state and explanation. Reviewed exclusions can set inapplicable only when the named rule supports
the code and its concrete exclusion predicate holds; they cannot set evaluated. Reviewed inapplicability records evaluation `not-run`;
unknown and unsupported evaluation records `unevaluated`. Unsupported rows without exclusions remain applicability
unknown and unevaluated. Findings retain whole-candidate scope in the embedded
unchanged verdict; only evaluated F7/direct-entry adapters expose exact-path finding attribution.
Other cells explicitly mark attribution unavailable rather than supplying an
ambiguous empty findings array.

| Rule               | Concrete footprint                                                          | Permitted evaluation                                               |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| INV-CLASSIFY       | Every complete inventory tuple                                              | Structural classification when the whole rule evaluated            |
| MOD-INDEX          | Entries owned by the successful nearest-index report, plus the index tuples | Structural index judgment with each associated index path recorded |
| MOD-DIRECT-ENTRIES | Actual index declaration tuples                                             | Direct entry count when the whole rule evaluated                   |
| F7                 | Regular production TS/TSX under configured size roots                       | Line count when the whole rule evaluated                           |
| Others             | No adapter in this slice                                                    | Unevaluated unless reviewed inapplicable                           |

Successful classification and index judgment never claim YAML, Ansible,
Terraform, HCL, Jinja, shell, archive or Kubernetes semantic evaluation. F7 rows
outside its footprint require a valid `outside-size-input` coverage exclusion to be inapplicable; otherwise
their applicability remains unknown. An unevaluated whole rule keeps all its
applicable rows unevaluated with the engine reason.

The version 1 report embeds the existing verdict and all identities, inventory,
selectors, subjects and matrix rows; `allowed: false` and `certifies: false` are literal.
The diagnostic emits complete JSON and exits one when any cell is unevaluated.
Ten unadapted full-registry members make every currently valid nonempty matrix
unresolved, so exit zero is unreachable in this slice. A future change enabling
a fully adapted matrix must add and prove refusal-effect exit handling before
permitting exit zero. Refusal findings remain visible in the embedded verdict. A boundary refusal exits one and emits no report.

## Acceptance Matrix

| Fault or input                                                               | Required observation                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Ordinary YAML and extensionless executable committed                         | Both exact tuples remain in full inventory and selected matrix                                    |
| Either tuple omitted from review inventory                                   | Refusal before report                                                                             |
| Selected YAML/executable omitted with complete inventory                     | Refusal before report                                                                             |
| Subject tuple changed, absent or repeated                                    | Refusal before report                                                                             |
| Missing, unreadable, malformed or internal authority                         | Named refusal before report                                                                       |
| Missing or duplicate registered mode                                         | Existing policy refusal through the new command                                                   |
| Candidate, tree, snapshot, policy, adopted set, registry or runtime mismatch | Named identity refusal before report                                                              |
| Unsupported YAML/shell semantic row                                          | Unevaluated; an empty finding set does not promote it                                             |
| Review attempts evaluated status or unknown rule                             | Strict schema/registry refusal                                                                    |
| Reviewed exclusion                                                           | Exact tuple and rule-supported code/predicate required; inapplicable and not-run with attribution |
| Unsupported semantic exclusion                                               | Refusal; unsupported rows remain unevaluated                                                      |
| MOD-INDEX judgment                                                           | Exact returned index/member relationship and associated index path required                       |
| Existing complete check fixture                                              | Original version 1 verdict unchanged                                                              |
| Extra operand, --rule, abbreviated SHA                                       | Usage/selection refusal                                                                           |
| Successful report                                                            | Literal allowed:false, certifies:false; no native or live evidence                                |

## Risks / Trade-offs

Source runtime closure hashing adds bounded IO and must cover the actual command
implementation. Bundled/source identity parity needs separate focused evidence.
Whole-rule evaluation is coarse; adapters deliberately expose only demonstrated
footprints. Review is external provenance, not admission authority. Large selected
sets produce a matrix proportional to selected tuples times the fixed registry.

## Migration Plan

Add a new command and internal execution result; retain existing public verdicts.
No stored-state migration or rollout action is required.

## Open Questions

None for the bounded contract. Additional semantic adapters require a later change
with concrete evaluators and their own production-path negatives.
