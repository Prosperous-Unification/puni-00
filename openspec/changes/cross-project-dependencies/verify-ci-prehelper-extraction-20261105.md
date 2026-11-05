# Current CI fixture compatibility repairs — 2026-11-05

## Authoritative failures and bounded fixes

PR870 run42001134790 completed failure. Its workspace artifact/console identified
an undeclared `tmp/entry.ts` from an inert owner-test metadata spelling; its
storage artifact identified a historical source extractor swallowing appended
ordinary imports, failing at generated line722 before the intended invalid SDK
build. The two existing live/expired original-drop failures remain separate.
The ADR collision is not this workspace failure. Full server-digest-matched
captures were retained; decision SHA256
`16077eee5a15244922c91d35df6bd58c84d5cc054db6adb03b0f3f17bd4c0d71`.

Within the owner-test lease, changing only four parent traversals to two in the
inert metadata label preserves `/work/repo` normalization to `/tmp/entry.ts`.
The actual workspace oracle failed0/1, then passed1/0/2with SAMEargv. No project
input declaration or production detector was broadened. Root's final combined
source rerun also passed1/0/2.

The disjoint storage-test fix extracts pure `compileActualPrehelperImage` and
bounds the historical catch/finally before one uniquely checked ordinary import,
with ordering/terminal-brace checks. Pure full-image RED reproducedUnexpected{
line722; SAMEconsumer GREENpassed1/0/5. Three0/1/0omissions prove specific early
boundary diagnostics only: the missing unique marker otherwise reaches ordering,
wrong order reaches tail, missing tail reaches the parser. They do not prove
unsafe image execution after guard removal or separately cover duplicate-marker
necessity. Existing actual execution assertions and42registration declarations
are byte-identical; the69expanded-case structure remains.

Storage test final SHA256
`05f05c0befacbdbaecf34e9e68ba4e5bd719d0c43a251dc5e3673db6a3457acb`.
Independent source/one-case review SHA256
`c94121f1b0d32ec729956d816e5af3ef6b0869799517933d448aa54167f71cd5`.
After child source froze, Root verified exact prefix and pure rendered historical
JS equality against immutable ef66fixture:18792bytes/SHA256
`386400ac425efe26c260f42bf3aa602606fce9dda1b85cd556c458a06464d877`,
1pass/0fail/6assertions. The new child suffix was never evaluated by this proof.
Configured combined types passed before the actual finite test.

## One actual invalid-build consumer

Root ran exactly the reviewed anchored storage case once, Bun1.4.4,
no-env-file/empty configuration/scratch preload, childumask022, closed PATH and
owned TMPDIR. PID/PGID2303929 exited0, no signal, both actual pipesEOF; all three
source files/modes were unchanged. Complete receipt SHA256
`134686a9e0fec3365722814a62a2ab9593975ed31e28afa5c0001627552dd064`
remains under `/tmp/puni-child-root-20261105/actual-invalid`.

Actual output: **1passed,68filtered,0failed,84assertions**,1file,260ms. It
collected the existing69tests but executed only this case. Its complete
UC2_PREFLIGHT_FAILURE diagnostic records pre-helper terminal-setup-refusal,
spawnEntered:false,children:0 and4originals: mkdtemp/twowrites fulfilled;
actual Bun.build rejected as intended. Every original/observer joined,5clock
observations validated, scratch cleanup returned. Existing semantic assertions
also require correct complete reporting and parent timer retirement. No private
constructor, ordinary image or storage/SQL preparation ran.

Independent actual review SHA256
`2cded0fc034ce24154878e3691900151a20886f8be27c5009a1788bb42f92c6f`
accepted this narrow repair receipt. It is not full storage69/fullCI, native
custody, actual HOLD qualification or release-gate evidence. No rerun/restart or
helper grant follows. The pre-existing two raw-original drop failures still
require coupled owner/storage/complete implementation and contained tests.
