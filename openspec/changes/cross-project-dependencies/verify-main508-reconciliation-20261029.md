# Private main508 reconciliation, 2026-10-29

Working union: private `cbdffe837f67f5db70cb7212a8afaeabbf44f205` plus upstream
`50862bc3748ace685aad6c942ddd57a738f7f3c9`. The private parent already retains the
normal CI correction checkpoint501280 and accepted Kubernetes leaf0a99b1f.
The architecture decision is `/tmp/puni-r18-main508-preflight-integration-decision-20261029.md`,
SHA256 `dd3f3cfd09428968ed0b8585a45279994d3fcb3ed3bfc796d1aa7c2208f9ed64`.
This is private source reconciliation, not MAIN adoption or deployment.

Four actual conflicts were resolved: MCP verification retained both historical
suffixes byte-exactly; deploy-k3s retained audience parsing and private local/digest
reader restrictions; execute retained private controller/store/Lease/file-journal
imports plus main YAML/config support; swap-maintenance retained both exact Docker
command handlers. No whole-file ours/theirs replacement was used.

Compose preserves private exact candidate/previous DB-free observations and writer
inventory, then main MCP preflight while outgoing still serves, then durable stop.
Accepted audiences grant only the named MCP audience difference. Explicit empty
capability semantics remain an observation; the new refusal controls use missing
candidate/rollback executables, not a new interpretation of empty support.
Stopped-writer proof, strict dormant authority, maintenance/exposure checks and
attended recovery remain unchanged. The main MCP live-WAL mount is distinct from
private recursively readonly stopped-store scanner commands.

Kubernetes preserves candidate-overlay configuration (never the old live ConfigMap),
capture-only backend Secret injection, settings then audience CLIs before snapshot,
and main's explicit older-candidate MCP exception. The private digest-reader DI,
both binary observations and all five fresh store boundaries remain. The controller
barrier returns its actual checkpointed interval, which the post-Job recheck reuses;
store uncertainty still escapes generic automatic recovery. Audience/older settings
now explicitly accompany the existing ENABLED-store and late drift tests. Neither
option skips dependency, controller, sticky Lease or migration-set checks.

The strict runtime organization activation reader is unchanged. Main's separate
pre-migration reader/ledger helper does not map not_migrated to dependency DISABLED.
All104 private migrations and their full set/hash/rollback rules remain; this main
change contains no migration SQL. Earlier SQL, source, runtime and finite public
parity evidence retains its original source epochs. The same-artifact human-only
policy and cold MCP startup were not altered by this merge.

## Actual owning results

| Command group (normal Bun scratch preload and existing case limits) | Passed | Assertions |
| ------------------------------------------------------------------- | -----: | ---------: |
| settings CLI, audience CLI, organization activation                 |     47 |        125 |
| MCP command/planner, swap writer barrier and maintenance            |    195 |      4,282 |
| capture adapter, deploy-k3s, MCP manifest and deploy arguments      |    193 |        550 |
| mounted controller release and release executor                     |    109 |        781 |
| real MCP swap CLIs with exact dependency command dispatch           |     10 |         50 |

Each group has zero failures: **554 tests, 5,788 assertions** total (excluding
selected fault/restoration repeats). No timeout, memory/performance threshold,
case, direct unpooled check or assertion was removed or weakened.

The first new MCP fixture run failed before its intended consumer: its transport
sent the private earlier `--entrypoint bun` dependency command through the main
`--entrypoint sh` MCP parser. That setup seam is not credited as an MCP safety proof.
The correction matches the complete independent DB-free command vector and runs the
real backend CLI; other runs still use the real MCP CLI parser with strict
unexpected-command refusal. Original MCP-only counts remain, with separate
independent candidate/previous command assertions.

Four observed narrow faults, each followed by exact source restoration:

- Remove private binary preflight: both accepted-audience/missing-executable cases
  incorrectly reach durable writer stop instead of the intended refusal.
- Remove fresh store invocation: the MCP-option-bearing ENABLED case resolves
  instead of requiring attended recovery.
- Remove the same-original post-Job barrier: source replay appears after both raw
  PVC and Lease drift, despite the configured MCP exceptions.
- Broaden the fixture's command family to every Docker run: capability JSON reaches
  MCP settings and both real audience consumers fail at the wrong policy boundary.

The same selected seven cases then pass on exact restored source. These are current
composition observations; earlier leaf and main omission receipts remain historical.
Proof comments were added only after observing these failures. No unrelated native,
historical, memory, performance or public-parity campaign was replayed.

## Static and review boundary

All eight changed-owner lib/spec compiler programs pass (be-01, SQLite adapter,
tool-deploy, tool-remote-scripts). Scoped lint passes all25 changed TypeScript paths.
Formatting and full/scoped OpenSpec validation are recorded with the final handoff.
The index's four merge entries remain for Root alone to stage; source conflict
markers are gone. Root owns final frozen review, normal-hook commit, publication,
fresh full CI and the canonical host gate. No merged-source full-gate or deploy
success is claimed here.

Private evidence: `/tmp/puni-r18-main508-actual-union-20261029`.

- `initial-conflict-pins.json`: SHA256 `0d64c68e9192e9f68f12e16eec9ea56cf17a05c23ef66adc8a25d54855667282`.
- `swap-mcp-initial.log`: SHA256 `e0eaedabc5eeb8376a64a91857c5dfc0f617a595704fa630a67eeb80473a055d`.
- `swap-mcp-family-green.log`: SHA256 `b8e4d9725994682698ac247519c9d250689a771b4f2554707d8ecf4b456406da`.
- `cli-initial.log`: SHA256 `33271f1afc2bfda58950d9ffcf2fe31a28aabb871957bb61a26ef17f1c278482`.
- `remote-initial.log`: SHA256 `72cc8f821e0c149ecfc90d17a33695ee40b68c665e655f090d9ca95f6e600df6`.
- `adapters-initial.log`: SHA256 `188ec91b01895dda037da4dfae9c898019d6447b2e4a7e6725d8c3b4bf94226a`.
- `controllers-initial.log`: SHA256 `a65d6b7b3e835b64f943c7cf186e694c4b8dfb8e2aa00ef06aee7c2bdf322da3`.
- `composition-proof-receipts.json`: SHA256 `ac237a8a774035cd70b1c0c7b7fae73e6f166098f96659f736f6d9654bb1bae7`.
- `composition-proofs-restored.log`: SHA256 `1d1a499c328b7d4dc484fd5474934810d33c8156d3540df6ffde1e3f1b3f56b7`.
- `typecheck-be-receipts.json`: SHA256 `d0f9e5be2856aee67f804bff4797df0520c619d3db9a537f7141e826c19ea300`.
- `typecheck-sqlite-receipts.json`: SHA256 `7b127dfb82a2e60946b32e2014306e8be82779532f9f12cfcb81cfb04caf880b`.
- `typecheck-deploy-receipts.json`: SHA256 `a92379b5d8f938328ffa1d48ea55f3aec2e568e7466ddbc3fca504c6a9c56a18`.
- `typecheck-remote-receipts.json`: SHA256 `549ed909d96829cfe984f7b08c04aa3356a68540150dc5726511d861639286f6`.
- `lint-0-receipt.json`: SHA256 `f36a43e71c260abd95f6089aadcdd1d7e15f67b0e931aabf4948af87342d51c3`.
- `lint-1-receipt.json`: SHA256 `610fba0d89ccebf6a1b6097f2f897834068bb884a233b70ba339d9e14428b48c`.
- `lint-2-receipt.json`: SHA256 `f3a41bcebb965b5dbe47856c40c37f6efc845ad3cc2bec132e663ca1eb343616`.
- `lint-3-receipt.json`: SHA256 `ffd9ba5843a101e044b5fe63546edbf6dbad3263439af0a249d08a2a6737053a`.
