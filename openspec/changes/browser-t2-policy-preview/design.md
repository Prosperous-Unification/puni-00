## Context

Design-only packet on wave11 #556, `37dbc32c8144ea2f1f37e003f3bd407865a93995`, tree `cf2455746ccf14ea7df453369c0878916df9089f`. The coordinator authorized the bounded recommendation after source inspection and adversarial discussion of modes, scope and authority. The combined brainstorming/grilling/domain-modeling work resolves only this preview; it does not select a trusted issuer or authorize implementation. One new term is recorded in [CONTEXT.md](../../../CONTEXT.md).

Existing `evidence/browser-t2.ts` calls the real Browser-only scenario ledger, verifies its identity and complete citation partition, and exits zero for any valid diagnostic. `browser-source-levels.ts` adds source ownership and classification, but source ownership is not tested-module evidence. The preview needs no additional ownership join: T2 already carries each exact ReportCase and isolated Browser levels. Paths in this document are relative to `apps/twilight-structure/twilight-burokrat/cli/src/`.

`rules/rule.ts` defines observe/enforce/ratchet effects and path-boundary adoption. `rules/rule-policy.ts` requires a mode for every registered rule. Registering T2 would invalidate external policies and alter the registry/runtime identities pinned by `evidence/evaluation-coverage.ts`. `policy/trust.ts` has a separate obligation/receipt admission path. Neither registering a rule nor hashing diagnostics supplies Browser execution authority.

## Goals / Non-Goals

**Goals:** preview citation policy effects for one exact diagnostic observation; retain all evidence and debt; provide strict proposal reads, stable identities and honest CLI status.

**Non-goals:** registration, trusted activation or admission; execution or served-byte authentication; actual test execution; global T2 completeness, coverage or source reconciliation. Existing v1 diagnostics and policies remain unchanged. This packet implements nothing.

## Decisions

### Entry point and proposal boundary

Future command:

```text
inspect-browser-t2-policy <repository> <full-committed-sha> <external-rule-policy> <capability> <external-ledger-authority> <external-proposed-policy> --now <UTC-instant>
```

The command accepts exactly these operands and one explicit instant, normalized with `readEvaluationInstant`. No ambient clock, symbolic revision, supplied observation body, optional mode override or candidate execution is accepted. Future ownership is `evidence/browser-t2-policy.ts`, its production CLI tests, thin routes in `cli.ts`/`bin.ts`, and the owning README. No registry or RulePolicy field changes are required.

The proposed policy is a closed schema-one record:

```ts
type ProposedCitationPolicy = {
  schemaVersion: 1;
  kind: 'proposed-browser-citation-policy';
  binding: {
    revision: string; // Full lowercase Git commit identity.
    candidate: string; // Canonical candidate SHA-256.
    capability: string;
    evaluatedAt: string; // Canonical UTC with milliseconds.
    rulePolicyDigest: string;
    browserT2ObservationDigest: string;
  };
  disposition: { mode: 'observe' | 'enforce' } | { mode: 'ratchet'; adoptedPrefixes: string[] };
};
```

Every object rejects undeclared fields. Digests are lowercase 64-hex; capability is nonblank; revision is 40/64-hex. Ratchet prefixes use the existing canonical `RelativePath` grammar, with no root sentinel, duplicate, glob, traversal, dot segment, backslash, NUL, absolute path or trailing slash. An explicit empty list adopts nothing; overlap between distinct prefixes is valid. Prefixes need not currently match a file: the proposal can include a future path, but it cannot exclude any current case from inspection. Observe/enforce reject `adoptedPrefixes`, including an empty list, instead of ignoring it.

Read one regular file through the external-artifact boundary, requiring canonical absolute path outside the candidate and no symlink component. Absence, unreadability, nonregular files, malformed UTF-8/JSON/schema or invalid pins refuse. Capture bytes once and retain their SHA-256; later path edits cannot change that invocation's decoded proposal. This is immutable-input capture, not authenticity or protection against hostile concurrent filesystem mutation. An outside path does not establish ownership or trust. No arbitrary proposal identity string is treated as authority.

### Consume the actual observation

Call `inspectBrowserT2` with the original operands. Recompute the full upstream digest; require exact requested revision/capability/instant, literal diagnostic markers and every proposal binding field to agree. The pinned upstream digest binds publication scope (mode/invocation), case partition, selected source tuples, full B3 selection and complete nested ledger. No digest-only shortcut may skip the real reader. Upstream missing authorities, wrong-level isolation, source/index failures actually encountered by that path, publication drift and full-tree B3 conflicts remain refusals. This preview adds no whole-tree index check or claim of source-owner completeness.

Require unique case IDs and a one-to-one relationship between non-cited case rows and original citation findings before projection, matching kind, terminal title and status. Preserve cited rows, including active other-capability IDs. Reuse upstream citation interpretation; do not add a second title parser. If a dependency fault returns an impossible citation union, throw rather than map it to no finding. These projection checks are tested with labelled dependency faults after real inspector execution, including resealed envelopes.

### Effects and output

Each non-cited row yields exactly `{caseId, path, kind, effect}`, where `path` is its full ReportCase file, `kind` is missing/malformed/inactive, and `effect` is debt/refusal. Observe always yields debt; enforce always refusal; ratchet yields refusal exactly when the file equals a prefix or starts with that prefix followed by `/`. Reuse the existing `isAdopted` behavior without manufacturing a registered rule. Order findings by canonical caseId. Do not filter by test status, capability of a valid citation, source owner, scenario obligation or adopted path.

Schema-one output has kind `browser-t2-policy-preview`, revision, candidate, capability, evaluatedAt, the upstream publication scope and rule-policy identity, `proposedPolicy` (the decoded captured record), `proposedPolicyDigest` (raw byte SHA-256), `browserT2` (the complete upstream envelope), `browserT2ObservationDigest`, `findings`, `proposedDisposition:{kind:'no-citation-refusals'|'citation-refusals'}`, `authentication:{kind:'absent'}`, `certifies:false`, and `observationDigest` over the entire payload except itself. No `allowed`, `accepted`, `covered`, `passed`, receipt or certification field is added. Nested upstream fields retain their original documented meanings.

Identical inputs produce identical output. Raw proposal whitespace/key-order changes change its byte digest and the enclosing digest even when effects are identical; prefix order is retained in the decoded proposal, and never changes effect semantics. A proposed disposition of no-citation-refusals says nothing about execution success, ledger debt or admission. All original failed/skipped cases and nested findings/debt remain visible.

Emit JSON and exit one only for citation-refusals; valid no-citation-refusals emits JSON and exits zero even when it contains observe-mode debt, failed/skipped tests or nested ledger debt. Invalid operands/reads/joins throw and exit nonzero with named stderr and no JSON. Compute everything before output. Source and built installed dispatch have the same contract.

### Safety proof strategy

Use real committed Browser publications and the real T2 inspector in production CLI tests. Fixtures can have empty ledger obligations so citation behavior is independent of coverage. Prepare the proposed binding from a prior real T2 observation; a changed publication or evaluation instant must require a new explicit proposal. Exercise each mode with missing/malformed/inactive and passed/failed/skipped cases, active foreign-capability citations and precise ratchet path boundaries. Corrupt proposal inputs and dependency outputs separately. Watch each new guard/output/dispatch fault fail its intended assertion, restore it, then add adjacent Proof comments; preserve actual logs and final restored controls in verify.md.

## Risks / Trade-offs

The output deliberately includes complete upstream observations, so payload size follows existing diagnostics. No broader IO/bounded-input guarantee is introduced. A fixed instant and full observation pin make proposals reproducible but require regeneration after any relevant upstream change. B3 source conflicts can block a real repository preview; passing synthetic fixtures cannot close that debt. A preview with no citation refusals is easy to misread, so its name, proposed disposition and absent authority markers must remain explicit.

## Migration Plan

Add an opt-in command after exact design review and separate implementation authorization. Allocate scenario IDs with the production allocator before implementation tests, preserving the journal prefix. Regress existing T2, Browser ledger, CLI and installed routing behavior. This documentation PR changes no global allocation, registry, policy, trusted store or activation. Later registration must define Browser-only versus full T2 scope, migrate all external policy modes and coverage review pins, and prove independent receipt authority plus admission freshness. Those changes require their own reviewed design.

## Open Questions

No external authority decision is needed for a diagnostic preview. Protected Browser producer/receipt authority, served-byte verification, complete execution collection, other test levels, global source reconciliation and the admission bridge remain outside this change and unresolved. Exact-design review and implementation authorization remain pending; this packet is reviewable, not proof of enforcement.
