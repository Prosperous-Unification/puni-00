# Dedicated dependency owner: managed exclusion slice

Scope: first real retained owner lifecycle, based on
`bb8ec1a91fef94640c1b49413a7af80d10fbb6a5`, in the isolated disposable clone
`/tmp/puni-dependency-owner`. Parent task 10.2 and complete activation remain open.
The proposal intent is unchanged. Design, testable delta requirement and ordered
O1–O4 tasks were added before implementation.

The dedicated explicit `--fence-managed` entrypoint builds separately from swap.
It takes actual edge/dev poll/devsync/prod-dev deploy flocks, publishes a private
synced exact attempt/plan marker, and issues a callback-scoped in-memory owner.
Every Docker boundary retains durable numbered intent before execution, verifies
ownership on both sides and retains its response. The existing managed fence
cores retain exact preflight cohorts, bounded Docker observations and independent
physical readbacks. Public fence wrappers retain their existing flock behavior.
No swap admission/dormant capability/SQLite mutation path changed.

## Observed checks (2026-10-23)

- `bun test tools/tool-remote-scripts/src/lib/edge-ownership.test.ts tools/tool-remote-scripts/src/lib/gateway-exclusion.test.ts tools/tool-remote-scripts/src/lib/backend-exclusion.test.ts tools/tool-remote-scripts/src/activate-dependencies.test.ts`: 153 passed, 0 failed, 820 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:typecheck`: passed, real TypeScript command output, zero cache hits.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:lint`: passed, uncached complete project ESLint.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:build`: passed all four tasks, including the new dedicated Bun bundle.
- `bunx openspec validate cross-project-dependencies --json`: valid, 1 passed/0 failed; existing long-requirement warnings remain.
- Formatting and normal installed Lefthook commit checks are recorded after their actual execution below.

The first default Nx invocation exited zero after socket-denial diagnostics
without target command output. It was **not** accepted as verification; explicit
in-process/no-daemon reruns above printed and completed the real commands.
Dependencies reuse the existing locked workspace installation through a local
`node_modules` symlink; no fresh frozen install is claimed.

## R5 observed fault proofs

All faults edited the actual production module independently, invoked its real
Bun tests against disposable files/flock descriptions and the Docker boundary,
and restored production source before final green checks. No copied verifier or
source-only assertion substitutes for runtime execution.

| Injected fault                                | Production-path acceptance that failed              | Observed failure                                                                    |
| --------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Omit full-SHA/empty-plan guard                | invalid SHA; empty plan                             | Publisher reached callback; expected refusal failed, exit 1 each                    |
| Omit environment uniqueness                   | duplicate environment with distinct state directory | Publisher reached callback, exit 1                                                  |
| Omit canonical directory guard                | symlink layout root                                 | Publisher reached callback, exit 1                                                  |
| Omit directory enumeration                    | execute/write-only trusted state                    | Pending published before directory-sync refusal; absence assertion failed, exit 1   |
| Omit canonical lock guard                     | symlink edge lock                                   | Publisher reached callback, exit 1                                                  |
| Omit edge lock path                           | actual edge competitor                              | Real competitor acquired flock, exit 1                                              |
| Omit deploy lock paths                        | actual deploy competitor                            | Real competitor acquired flock, exit 1                                              |
| Omit dev lock paths                           | dev poll/devsync competitor                         | Real competitor acquired flock, exit 1                                              |
| Omit overlapping-path refusal                 | prod/dev share state directory                      | Reached nested real-flock refusal instead of preflight overlap refusal, exit 1      |
| Omit ordinary retained-owner admission        | existing edge-owner.json                            | New owner callback executed, exit 1                                                 |
| Omit pending publication                      | callback reads required exact pending plan          | ENOENT before authorized work, exit 1                                               |
| Omit callback expiry                          | expired/reconstructed owner                         | Expired capability lost its explicit live-authority refusal, exit 1                 |
| Omit exact SHA binding                        | owner managed gateway/backend execution             | Wrong-SHA call reached Docker cohort work, exit 1                                   |
| Omit exact layout binding                     | foreign layout Docker call                          | Effect executed, exit 1                                                             |
| Omit live FD identity verification            | replace held deploy.lock inode                      | Effect executed on foreign canonical inode, exit 1                                  |
| Omit pending byte equality                    | changed durable pending marker                      | Effect executed, exit 1                                                             |
| Omit numbered durable intent publication      | Docker callback independently reads its intent      | ENOENT before the effect, exit 1                                                    |
| Omit cancelled-boundary refusal               | aborted signal                                      | Effect executed, exit 1                                                             |
| Omit immediate post-effect ownership readback | marker lost during effect                           | Fabricated successful boundary readback published; absence assertion failed, exit 1 |

Initial tests failed before the module existed. Dedicated coordinator acceptance
failed before its real namespace/state boundary injection was connected. The
unreadable-directory negative failed before adding pre-publication enumeration.
Restored-source tests also distinguish missing versus unreadable trusted state
and marker files, hold a dev poll flock before publication to prove prod deploy
has not been touched, preserve intent after an interrupted Docker stop, and
reject owner JSON reconstruction and expired capabilities.

Composed acceptance uses the real managed gateway/backend cores, a production
Docker boundary fixture and the existing actual namespace audit adapter. It
observes all four exact-ID restart/stop effects after readable durable intent,
real deploy-lock exclusion, physical stopped/PID states, retained owner and
cohort receipts, and no start/restart/remove/exec activation commands. Dedicated
coordinator acceptance returns only `managed-excluded`, `activation: blocked`
and unresolved roster obligations. Default/unsupported/incomplete CLI modes refuse.

## Limits

No live h2/production fence, deployment, push, installation, owner cleanup,
restoration, activation or exposure ran. No complete participant proof exists.
Installed-writer adoption/drain, ingress, MCP, solver, replay/background and
restart exclusion plus atomic activation, compatible restoration and attended
handoff remain O4 work. Actual Docker acceptance and an integrated exact-SHA
host gate were not run for this isolated source slice. Existing installed writers
are not proven to have adopted the source admission guards.

## Integration state

Independent review and the integrated exact-SHA host gate remain pending. This
candidate does not claim approval. Root will arrange independent review after
this implementer releases its agent slot.

`bunx lefthook run pre-commit` passed over the complete staged candidate:
Prettier format, staged ESLint, plaintext-secrets, private-nesting and tool-wiki
commands completed. Tool-wiki explicitly returned `status: inactive`,
`certified: false` because the external activation root is not provisioned; no
certification is claimed. Migration hooks and doc-caps skipped because this slice
contains no matching migration/LLM_README changes. `git diff --check` passed.
The candidate commit also runs the installed normal hooks without bypass.
