> Historical research/design snapshot. Original capture paths are provenance labels, not fresh-clone links. [November1 evidence](adapter-sdk-20261101.json.gz), [November3 evidence](adapter-sdk-20261103.json.gz) and [packet hashes](adapter-sdk-manifests.json) retain the available original files, including registry metadata, source receipts and official package archives/licenses. The migration proposal remains unadopted; no SDK feature profile is selected by the PostgreSQL decision.

# ACP adapter: concrete migration proposal

Status: proposed design, not adopted or implemented. This packet advances required
I2.04/I2.08 work while the separate outcome-delivery import-policy proposal is
pending. It neither changes that proposal nor authorizes a policy bypass.

## Intent

Connect PUNI's ActivityExecutor to a real ACP SDK client without inheriting the
prototype's automatic tool approval, global load-capability requirement,
end-turn-only response handling or unobserved child termination. Preserve
session-separated streaming and complete capability-gated session/load replay.
Keep exact preparation, locator and turn identities and report missing per-turn
usage explicitly. The adapter must participate in shared executor conformance;
the successful API-model tests are not that acceptance.

The migration must preserve the old example until its surviving consumers and
behavior have explicit replacements, then retire it. It must not make the
infra example import the Dash application. No new shared library is justified
solely to keep a retiring demonstration alive.

This is part of the original full foundation objective. PostgreSQL feasibility,
the second durable provider and complete S7a remain required separate work.
No live provider spend, login/credentials, tenant limits, compute activation,
operator migration or production is included.

## Observed current state

Source fingerprint:
`49ba32d4dd0763fec4a784388146c73f6b47a1d7655f57ec772364564b159da5`.
The fresh full snapshot covers12,730 paths/modes/symlinks; index
`73bd8f68637dd28ecb4d27b0245c73a354668253c826c22f0467c72de51ad3fb`,
HEADd65 and pending MERGE_HEADc894 are unchanged. No native session or other
agent was started for this design.

- `tools/harness-example/src/acp.ts` implements initialize, newSession, prompt,
  loadSession and void close, against installed ACP SDK1.4.0.
- `decidePermission` selects the first allow-once/allow-always option. It does
  not consume an accepted PUNI tool policy. It throws when no allow option exists.
- `connectAcpAgent` refuses the whole connection when loadSession is absent,
  although a peer may support new sessions and prompts without replay.
- The per-session collector map permits separate sessions. Its source has no
  same-session in-flight guard before replacing a collector; no runtime failure
  is claimed from that static observation.
- Every prompt stop except end_turn throws, losing the distinction between
  determinate refusal/limits/cancellation and transport uncertainty.
- `spawnAcpAgent` closes transport and sends child.kill() without awaiting exit.
  This does not observe the child, descendants or remote work as quiescent.
- The in-process fake peer handles only successful end_turn and ignores cancel.
  Existing harness tests cover task/session separation, parallelism and streamed
  updates; log tests cover text coalescing. Those bodies do not exercise rejected
  permission, cancellation, failed initialize, malformed replies, same-session
  contention or process exit. No new runtime test was run in this audit.
- Burokrat's AcpClass contains agent, prompt and tools. Only CliHarnessClass has
  permissionMode. Treating the ACP tool-name list as an established native
  permission boundary would invent a contract.
- ActivityExecutor has8 methods and no recall method. A serializable locator is
  distinct from its adapter-owned live ActivitySession. A recall product surface
  must be specified explicitly rather than disguised as resumeSession.

The earlier exact SDK consumer evidence remains valid only for its old candidate
graph: ACP2.1 stable compilation rejected the logger's plan_update case; the
explicit unstable consumer compiled. The retained2.2 source comparison is not a
2.2 runtime/compiler pass. Neither graph is adopted by this proposal.

## Recommended approach and alternatives

Recommend a direct ACP client and ActivityExecutor adapter owned by Dash. It
exposes the permission and replay boundaries the product needs. A separate
agent registration resolves command/argv/workspace and the supported policy;
bindings are not executable shell text or arbitrary approval predicates.

1. **Stable ACP v1 core, explicit optional draft profile**: recommended for the
   new product adapter. Stable plan events remain supported. Draft ID-based
   plan_update is a separately selected and capability-tested profile. Select one
   complete SDK entrypoint consistently within each app and its directly
   connected fake peer; do not pass unstable payloads through a stable parser.
2. **One full unstable v1 profile**: preserves all currently referenced draft
   events, but accepts upstream non-major breakage risk for the entire adapter.
3. **Harness-ACP wrapper**: not recommended for the first product connection;
   retained source shows cold restoration discards replay, and resolved wrapper
   cleanup does not establish native termination. This is not a claim that the
   wrapper has no permission seam or can never be used.

SDK package2.x and ACP wire protocol v1 are separate versions. The profile choice
has been put to the user; no answer has arrived. The proposal is not permission
to upgrade the root package or adopt a particular agent backend.

For placement, do not introduce infra-to-Dash forwarding imports. During the
migration the old app may remain separately implemented until the product adapter
has its real replacement proof; any temporary duplication is explicit debt and
does not close task4.1 or I2.08. If a root2.x upgrade affects both apps, each app
and its directly connected fake peer must select its feature surface consistently.
They need not share one feature profile merely because they share a package.
Retirement is a separate final slice, not an indefinitely retained fork.

## Portable outcomes and retained evidence

The adapter must snapshot caller preparation/turn input before asynchronous
dispatch and preserve the accepted selection, actual peer-assigned session ID,
creation key, turn key and owner provenance. Original exact local replay cannot
invent durable backend deduplication. Any unsupported capability remains explicit
until independently proven for the selected backend.

Map all supported stop reasons through precise public outcomes. A cancelled or
limited turn is not a successful business outcome; a missing terminal response,
lost transport or ambiguous creation is unresolved. Unexpected malformed trusted
state throws a correlated ActivityDispatchError with original identity/cause.
The current shared TurnOutcome/TurnReply variants must be checked against every
mapping before adding a new discriminant or encoding a protocol in text.

Stable context-window/cumulative-cost notifications are not per-turn token
measurements. Use unknown/acp-v1-no-usage until a selected profile and actual peer
provide attributable per-turn evidence. A normalized numeric zero must not be
reinterpreted as a measurement.

Recall consumes loadSession capability and retains the complete ordered update
sequence until the matching response. It must not turn a missing load capability
into failure of otherwise supported new-session execution. An explicit product
recall return shape and artifact retention are still a design obligation, because
the current ActivityExecutor does not expose them. The serializer must preserve
original peer evidence separately from any UI projection.

Cancellation requests settlement; process close proves only its observed scope.
For a locally owned process, await the specific child's exit and owned stdio
closure, retaining failed cleanup and original causes. Do not infer descendant
or remote effect cessation from leader exit. Detached/remote work needs separate
identity and observation; unsupported authoritative quiescence stays unresolved.
No recovery path may start replacement work merely because transport closed.

## Required production-path proof matrix

These are proposed tests, not executed results. Test real SDK connections over
controlled byte streams and, where necessary, positively owned disposable Bun
child peers. A fake ActivityExecutor or fake policy callback alone is insufficient.

| Boundary                  | Positive control                                                               | Single fault / forbidden observation                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Initialization ownership  | successful handshake retains exactly its stream/process                        | failed initialize or missing required feature cannot leak an unowned connection; original+cleanup causes retained     |
| Session identity          | two peer-assigned sessions route interleaved updates independently             | replace session association and observe wrong-target rejection through the actual SDK path                            |
| Same-session dispatch     | one admitted turn or replay reader per session                                 | remove election and observe a displaced collector or a second dispatch, while a separate session still progresses     |
| Caller snapshots          | mutate submitted options/preparation/turn after dispatch begins                | remove only detachment and observe altered dispatch, replay identity or callback target                               |
| Capability-gated replay   | supported load returns all ordered history before its response                 | absent capability sends no load; incomplete/lost load cannot return complete recall                                   |
| Permission decision       | registered policy chooses a specifically offered permitted option              | no allow, no reject, denied operation, delayed approval after cancel and wrong-session request cannot become approval |
| Native policy enforcement | selected actual agent blocks prohibited edits and shell-mediated edits         | an agent which executes without asking must not certify a callback-only policy proof                                  |
| Stop reasons              | each selected SDK stop variant maps once with original identity                | missing response and unknown/malformed variants cannot become completed work                                          |
| Usage provenance          | explicitly supported per-turn evidence or explicit unknown                     | absent and cumulative counters cannot become measured zero/per-turn usage                                             |
| Cancellation              | active prompt receives cancellation and remains owned until settlement         | peer ignores cancel or abort send fails; no quiescence or replacement permission follows                              |
| Observer failure          | callback failure stops further observation and retains uncertainty             | remove observer fencing and observe a later callback through the real SDK stream                                      |
| Close                     | idempotent close fences new dispatch and observes its promised native scope    | failed close, leader-only exit or closed transport cannot certify complete physical stop                              |
| Recovery                  | original locator/preparation preserved after uncertainty                       | unsupported lookup/resume/effect inspection cannot claim absence or deduplication                                     |
| Prototype migration       | original session/revision/parallel/stream/log behavior has product replacement | retire the example only after all callers/tests/commands/docs have explicit dispositions and boundary checks pass     |

Every new effective guard needs its own actual negative, exact restoration and
adjacent truthful Proof comment. Earlier guards must remain installed. Distinguish
constructor/compatibility proof from unsafe production admission and distinguish
SDK fake-peer proof from a live backend policy guarantee.

## Existing consumer disposition inventory

All direct imports of the three prototype owners are internal to the example:

- harness.ts consumes AcpAgent and HarnessEvent; its graph calls loadSession.
- main.ts consumes real/fake stream factories, client and logger; its documented
  fake/real/file-prompt commands need replacement or explicit retirement.
- worker.ts consumes client/fake peer and emits its own graph protocol; its
  package target and worker tests need explicit disposition.
- harness.test.ts and log.test.ts preserve the current behavioral oracles.
- project.json owns run/package/test/lint/typecheck targets; the logger is not an
  independent published consumer found by this bounded source search.

Live orientation references include LLM_README.md, docs/platform-map.md,
docs/infra/{README,recovery}.md and docs/test-budgets.md. Historical findings,
ADRs and plans are evidence, not all instructions to rewrite. The exact owner and
reference list is captured in the companion inventory; retirement must inspect
each entry instead of a repository-wide delete or blanket text replacement.

## Next contract decisions and work order

The feature-profile preference is pending. Resolve native permission enforcement
and public recall semantics next using the actual selected agent registration;
do not silently widen Burokrat's strict AcpClass or ActivityExecutor. The current
boundaries support designing these independently of the unrelated write-delivery
policy approval. This is not authority to change either producer-owned binding
types or that pending lint setting.

After design adoption, create the OpenSpec intent/delta/design/ordered TDD tasks,
then implement in an isolated source cohort. First prove the SDK/profile/permission
and lifecycle boundaries with controlled real peers; compose the real adapter and
its shared conformance; prove exposed recall; migrate surviving callers; retire
the example only after replacement proof. Run appropriate current source-specific
checks, independent review and exact-SHA release gates. Retain live backend spend
gates and no-production boundary.

No new glossary term or ADR is adopted here. Existing terms already distinguish
live session, serializable locator, recovery fence and physical quiescence. SDK
entrypoint/placement proposals remain implementation choices until confirmed.

## Primary-source and execution limits

Fresh official sources read on2026-11-02:

- [SDK stable/unstable migration guide](https://raw.githubusercontent.com/agentclientprotocol/typescript-sdk/main/MIGRATION_STABLE_UNSTABLE.md): consistent entrypoints; stable v1 versus unstable features; capability audit; package/protocol version distinction. This moving-main read does not certify a particular tarball.
- [Session setup](https://agentclientprotocol.com/protocol/v1/session-setup): loadSession capability and replay-before-response; resume-without-replay distinction.
- [Tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls): permission requests are available to agents, not proof every effect is mediated.
- [Prompt turns](https://agentclientprotocol.com/protocol/v1/prompt-turn) and [cancellation](https://agentclientprotocol.com/protocol/v1/cancellation): explicit terminal/cancellation behavior and cooperative request cancellation.

The web registry open for exact2.2.0 returned inaccessible/Internal Error. No
current-latest observation or new dependency/compiler/runtime pass follows.
Existing retained2.2.0 source and Oct31 compiler evidence are used only at their
original stated strength. No install, paid/native-agent session, SDK request,
runtime test, full gate, source/dependency/Git mutation or production action was
performed. Missing guessed acp.test.ts/acp-client.test.ts, README and binding paths
were diagnosed with rg; actual harness/log tests and binding paths were then read.
Those read failures are not product regressions or passing checks.
