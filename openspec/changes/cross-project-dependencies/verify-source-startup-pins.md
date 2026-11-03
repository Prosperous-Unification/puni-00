# Cold source startup pins: constructor and observation

This bounded P2b-1 packet adds independently prepared source-input manifests and
fresh observations of a live, stopped source participant. Every returned
observation has `activation: 'blocked'`. It grants no complete writer exclusion,
startup, storage, restoration, handoff or ingress authority. Parent P2b/O4/S4 and
controller adoption remain open.

## Source contract

`source-startup-manifest.ts` owns the closed pins/manifest decoders, canonical
UTF-8 serialization, independent artifact constructor and bounded descriptor-based
reader. `source-dev-inputs.ts` composes the existing owner and source-exclusion
APIs, private hashed Docker readbacks and existing role capability decoder.
Neither existing owner/coordinator/policy code nor ordinary dev startup changed.
No new deploy or activation CLI was added.

The finite `wbs-source-cold-v1` profile pins three fixed logical roots beneath the
validated dev layout: source, `node_modules`, and standalone `.git`; four required
private config slots remain outside the source entries. The manifest is bounded
to 64 MiB, 250,000 entries, 512 MiB per regular file, 16 GiB declared regular bytes,
4096-byte paths/targets, depth 64 and at most 40 symlink traversals. Configs are
nonempty, at most 1 MiB, exactly 0600, independently hashed and parsed privately.
One monotonic deadline covers observation and every recheck, at most 10 minutes.
All source-token reads consume that tighter deadline. On expiry, observation
requests abort and awaits the complete owner-wrapped runner settlement before
refusing. Injected transports must honor cancellation and settle; an uncooperative
transport cannot be both forcibly bounded and joined by a detached promise race.

Astra's architecture clarification admits ordinary regular-file mode 0444 in all
three roots, alongside 0600/0644/0700/0755. Directories remain 0700/0755 and configs
exactly 0600. Raw modes are retained: changing 0444 to 0644 still refuses. Normal
standalone Git objects retain 0444 without fixture normalization. Every ordinary
file requires `nlink===1`; copied dependencies cannot retain global-cache or
external hardlink aliases.

The constructor requires a clean full standalone clone at the independently
supplied SHA, with original commit blob identities and no external Git metadata,
locks, submodules or untracked/ignored source additions. It refuses the installed
source path and physical/symlink aliases into it. Only read-only Git commands run,
before metadata capture; installed observation never runs Git. Every preparation
Git subprocess consumes the same constructor deadline, receives hard abort and
awaits child exit plus both output pipes. A real Git process blocked opening a
FIFO `.git/config` refused within the test-only advanced monotonic budget and its
recorded exec PID was absent at API return. The original missing-deadline path
was watched returning `late`; the fixture killed/reaped that child. The short
clock is confined to the test, with no production budget/environment override. Symlinks resolve
component by component before `..`, so missing/non-directory ancestors cannot be
hidden by lexical normalization.

The observer freshly binds exact owner/layout/SHA and opaque live source token,
complete Docker membership, immutable runtime image/tag/entrypoint, ordered
Config.Env hash, strict profile controls, image-local global config absence,
`docker diff`, cold paths, all file bytes and membership/parent/file identities.
It repeats these checks after the role probes. Complete inventory identity uses
`identifySourceInventory` only after the exact raw source is independently
recognized under the tighter deadline. The shared reviewed native-mount
projection treats every container's Mounts as destination-keyed sets, preserves
all mount fields, and refuses duplicate targets. Source and unrelated mount
permutations pass; actual field/add/remove/duplicate/process/config drift refuses. Only `/tmp` runtime diffs are
supported. Warm caches, linked worktrees, alternate configuration and extra
source inputs visibly refuse; nothing is cleaned or installed.

The fixed ordered role roster is backend/candidate, backend/retained,
gateway/candidate and MCP/candidate. Equal backend inputs still produce separate
subprocesses. Each invokes its actual role CLI using the full immutable image ID,
one recursive read-only `/src` bind (including `/src/node_modules`), network none,
read-only image filesystem, user 1000:1000, `/usr/bin/env -i`, fixed PATH, disabled
Bun transpiler cache and `bun --no-env-file`. There is no `/data`, application Env,
solver socket, port or app-main invocation. No frontend capability is invented.
Image config absence is checked with native `/bin/sh`, absolute `id`, `getent`,
`readlink` and `find` before any Bun startup: Bun itself could otherwise consume
the very config being checked. Every image check runs the exact env-i capability
context without HOME; if validated image Config.Env contains HOME, it additionally
runs that unchanged HOME context. Neither context contains XDG_CONFIG_HOME. Both
UID/GID 1000 contexts independently require canonical readable/searchable homes
and absent `.bunfig.toml`; a passwd response is bounded to 16 KiB/seven fields and
the absolute home to 4096 bytes. Complete no-follow native enumeration detects
present or dangling config entries, errors and malformed output. The image-local
`/src/bunfig.toml` is checked without source/dependency mounts. Actual Bun 1.4.2
without HOME resolves the same passwd directory checked by the native program.
A separate read-only syscall acceptance traced the actual backend CLI using
`strace -f -e trace=file` with the exact scrubbed no-HOME role environment and
Bun `--no-env-file`. It returned the correct backend wire protocol; the captured
file syscalls contain two relative `bunfig.toml` opens returning ENOENT and no
`.bunfig.toml` or passwd lookup. For this exact pinned invocation Bun skips a
global home config lookup, so the additional passwd-home absence check is
conservative. This is direct CLI behavior evidence, not a claim inferred from
`node:os.homedir()`. The local trace is `/tmp/source-pins-bun-no-home.trace`.
The initial ptrace sandbox EPERM was retried with approved local-fixture
escalation; no HOME/source configuration was created or modified.

Failed/aborted read-only image or role probes return no observation and retain
the owner operation intent. Gated tests cover both a late response and a late
failure, waiting for runner settlement and, on a response, the exact latest
hashed owner readback before the API refuses. Daemon-side probe container cleanup
is **unverified** after failure: CLI/owner settlement is no container-absence
receipt, and no name/label/kill orchestration is introduced. Successful native
probe completion is followed by another bounded independently recognized complete
inventory comparison, including after the very last image probe. Returning
successful CLI output while retaining that final probe in inventory visibly
refuses. Its post-probe scan omission produced `Missing expected rejection`
before restoration. The fixture uses a distinct probe image/name/service so the
negative cannot be masked by the source scanner's conflicting-source guard.

Returned observations are immutable hash/protocol projections; their private
rechecks require the original live owner/source binding and deadline. JSON replay
cannot reconstruct that binding.

MCP's ignored OpenAPI document is absent initially. A future startup step must
validate the normal prepare emitter's generated document against its independent
expectation before claiming MCP readiness. This packet does not pretend cold
membership remains unchanged after startup.

## Independent preparation prerequisite

No installed checkout/dependency/config tree was hashed and self-approved. Tests
prepare a separate clean Git artifact first, produce expected pins there, then
copy it to another root and add separately supplied private config fixtures.

Future live preparation is separate reviewed work:

1. Create a disposable full clone without hardlinks or external alternates at the
   reviewed SHA, using the independently pinned runtime image/Bun.
2. Run Bun's frozen lockfile install in that disposable tree. Materialize its
   dependency deliverable by copies that break hardlinks and preserve admitted
   relative symlinks and raw modes. Confirm required executables remain present.
3. Remove only the fixed generated cache/output paths from the disposable
   artifact. Confirm the strict startup profile and actual role acceptance;
   ensure cold state again. The constructor never installs, deletes or cleans.
4. Independently review the desired four private configs and their hashes; pass
   only those hashes/sizes to the constructor. Do not derive missing expected
   hashes from an installed source root.
5. Transport the resulting exact manifest bytes, SHA and immutable runtime/config
   pins through separately reviewed adoption. Installed observation compares to
   these expected inputs and never creates their approval.

No live preparation, artifact adoption, host effect, full application startup or
physical Docker acceptance was performed here.

## Verification

Commands use Bun 1.4.2 from `/tmp/puni-pr630-bun142-al30yoqo` and Nx 23.2.1.
Configured Nx checks explicitly set `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`.
An initial sandbox socket refusal returned exit0 without running a target and was
not counted as a successful check.

Verification initially covered 141 tests (71 new and 70 existing source/role
consumers). After integrating the source deadline/join stack and the universal
mount packet, the final affected checks were:

Parent tracked base: `7b751d337`, the supplied `848f60c44` native-mount packet
cherry-picked atop root `21f720cc7`. Only the eight new source-input files are
owned by this packet.

| Command                                                                                                                                                                                | Observed result                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `bun test tools/tool-remote-scripts/src/lib/{source-startup-manifest,source-dev-inputs}.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000`                             | 100 pass, 0 fail, 431 assertions; both new production module suites                              |
| `bunx nx run tool-remote-scripts:lint --skip-nx-cache`                                                                                                                                 | Actual configured target passed                                                                  |
| `bunx nx run tool-remote-scripts:typecheck --skip-nx-cache`                                                                                                                            | Actual configured target passed                                                                  |
| `bunx nx run tool-remote-scripts:build --skip-nx-cache`                                                                                                                                | Target plus three configured dependency builds passed                                            |
| `bun build tools/tool-remote-scripts/src/lib/source-startup-manifest.ts tools/tool-remote-scripts/src/lib/source-dev-inputs.ts --target=bun --outdir=/tmp/source-startup-pins-bundles` | Both new modules bundled                                                                         |
| `bunx openspec validate --all --json`                                                                                                                                                  | 277 valid items: 259 changes and 18 specs, 0 failures; existing long-requirement warnings remain |

Additional final focused selection `-t 'aborted .* read joins|resolver-oversized|
resolver-wrong-uid|home-relative|home-overlong'` passed 8 tests/24 assertions,
including the six cases added after that 100-test run. Final restored guard
selection passed 33 tests, 0 failures and 71 assertions, covering native checks,
HOME poison, source deadline, four join paths, and complete inventory consumers. After the final post-probe scan correction, the entire observer suite passed
55 tests with 430 assertions and no failures. After the constructor Git fix,
the complete manifest suite passed 53 tests/61 assertions with no failures. Full configured lint initially caught test
transport typing/void callbacks and closure flow typing; those were corrected,
then the actual configured target passed. Its diagnostics were obtained directly
because Nx's captured failure output omitted the ESLint detail.

Development checks reused the parent worktree's installed `node_modules` through
an ignored symlink. No fresh frozen install or independently prepared real
monorepo dependency deliverable is claimed; the canonical integrated gate must
perform its required frozen install. The artifact fixtures are synthetic clean
standalone Git clones, kept separate from the actual Bun/Nx/role CLI acceptance.

The full configured `tool-remote-scripts:test` target is **UNRUN**: its required
Caddy prerequisite needs the pinned Docker image; no approved local Caddy binary
is available and no pull/host acceptance was authorized for this packet. The
full 1,868-test suite was not repeated. The final integrated canonical host gate,
including required Caddy execution, remains the parent integration's obligation.
No h2puni gate or physical source/runtime adoption is claimed.

## Watched production negatives

The initial forty omissions ran alone against the production module, each produced an assertion
failure, and was restored before the next mutation. Diagnostics were inspected;
exit status alone was not counted. Counterfactual inputs preserve unrelated
modes, parent membership and expected private hashes, so another check cannot
manufacture the desired rejection.

| Omitted or broken production boundary                                     | Observed failing test                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Manifest digest; closed pins                                              | `canonical manifest...`; `closed pins...`                                         |
| Ordinary file SHA256 only                                                 | Same-size `unchanged HEAD ... node_modules/module.js`                             |
| Expected membership comparisons                                           | `extra cold startup input ... shadow.js`                                          |
| Captured parent identities                                                | `captured parent identity...`                                                     |
| Ordered Env hash; forbidden control names                                 | `effective environment hash...`                                                   |
| Reserved cold-cache checks                                                | Tracked `cold cache roots...`                                                     |
| Immutable runtime image comparisons                                       | `expected manifest digest wrong ... image...`                                     |
| Runtime diff; image config subprocess                                     | `observer refuses diff/global...`                                                 |
| Retained backend invocation                                               | Exact four-role roster/call assertions                                            |
| `--no-env-file`; injected `/data` argv                                    | Production observer command assertions                                            |
| Expected role attribution                                                 | `observer refuses role...`                                                        |
| Final post-probe recheck                                                  | `observer refuses drift...`                                                       |
| Public error scrubbing                                                    | `observer refuses malformed...` exposed synthetic stdout secret                   |
| Regular-file nlink                                                        | `readonly Git files remain forbidden as hardlink aliases`                         |
| Owner SHA binding                                                         | Self-consistent foreign `manifest source identity...`                             |
| Opaque source-token binding                                               | `foreign copied source token...`                                                  |
| Individual file, entry count, total byte, manifest byte bounds separately | Otherwise valid oversized declarations in decoder/manifest limits tests           |
| Path byte and depth bounds separately                                     | `path depth and byte bounds...` with complete declared parents                    |
| Strict UTF-8 config decoding                                              | `malformed private UTF8...`                                                       |
| Full-clone check                                                          | `shallow Git metadata...`                                                         |
| Original Git object interpretation                                        | `Git replacement refs...`                                                         |
| Installed-root/self/alias refusal                                         | Isolated test-only fixed-layout constructor child fixture                         |
| Component-wise symlink resolver                                           | `relative link resolution...`                                                     |
| Exact four config slots                                                   | `canonical manifest...` with missing final config slot                            |
| Sorted entries; parent membership; directory modes separately             | `declaration ordering...`                                                         |
| Private config mode; dotenv parser separately                             | `private config unreadability...`; malformed private dotenv cases                 |
| Finite startup launcher/profile validation                                | Five independently committed incompatible package/Nx/serve/prepare configurations |
| Monotonic total deadline                                                  | `whole observation deadline...`                                                   |
| Hashed Docker readbacks replaced with raw readbacks                       | `private application environment...` exposed synthetic secret in owner records    |

Actual filesystem negatives also cover in-flight truncation/replacement,
membership addition, parent swaps, and a replacement parent retaining the exact
same single-linked leaf inode. Real Bun subprocesses prove poisoned dotenv is
loaded normally and suppressed by `--no-env-file`, execute all four actual role
CLIs, reject wrong-role decodes, and create no database. The exact native image-config
probe program runs against absent, present and dangling HOME bunfig
fixtures, separately poisoning only passwd-home and only image-HOME config.

Ten resumed counterfactuals independently removed the default HOME context,
image HOME context, native home absence, native image-source absence, canonical
home equality, native enumeration failure/output checks, joined owner reads,
tighter token-read budget, and ordered inventory projection. Each failed its
specific production-path assertion. A malformed enumeration fault was first
masked by a second parent enumeration, so the fixture was narrowed to poison
only the home lookup; the output-check omission then admitted that fault and
failed the expected-rejection assertion.

Three additional omissions removed the passwd response byte bound, passwd UID
check and final complete-inventory stability. Each admitted its isolated fault;
the last independently admitted unrelated mount field/add/remove, process and
configuration drift. The join omission was rerun against all four gated
image/role success/failure paths; every test observed an early return while its
cleanup gate was still closed. The constructor Git deadline omission left actual Git blocked on FIFO config
beyond the test-only remaining budget. The additional final-probe inventory scan
omission independently admitted a
retained successful probe. All mutations were restored before verification.
The inventory ordering counterfactual compares raw arrays and intentionally
refuses equivalent permutations; no obsolete unrelated-order refusal is claimed.

The real installed Nx modules exercise cache/workspace/native path resolution,
actual daemon and plugin isolation decisions, false dotenv loading and graph
construction with a deliberately broken file-map-cache reader. They select the
explicit in-root paths and never consume the poisoned external HOME cache,
target dotenv or broken graph cache. This is bounded module acceptance, not
normal all-tier dev startup/readiness.

Local mutation recipes/logs are `/tmp/source-pins-{mutants,more-mutants,final-mutants,profile-mutants,resume-mutants,closure-mutants}.py`
and `/tmp/source-pins-mutant-*.log`; the durable proof descriptions live here and
beside the guarded production symbols. No serialized record is writer proof.

## Parent integration text

Proposed bounded task entry: "Implement closed independent cold source-input
manifest construction and owner/source-bound hash-only observation with real
DB-free role probes; activation remains blocked. Record focused checks and R5
counterfactuals in verify-source-startup-pins.md. Live preparation/adoption,
complete exclusion, startup/readiness, handoff and controllers remain open."

Keep the existing 393-word proposal unchanged. Parent owners integrate the
focused design/tasks linkage after concurrent source packets are reconciled;
this packet does not mark parent P2b/O4/S4 complete.
