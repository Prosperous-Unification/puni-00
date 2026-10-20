# Phase collection diagnostics

These two instrumented physical copies derive from source
`72a7e82d2e8ccf4546cb6fee0c49742d0b42fd06`, archive SHA-256
`0db4b51fb0efd5a6623709e738472dab94106359ce89bde69a1ed0add996464b`.
Their embedded source revision names the uninstrumented base. Neither copy is a
published successor, production fix, acceptance run or certification.

The [trace-only identity](trace-only/identity.json.txt) records instrumentation
and refreshed authentication digests; the [second identity](gateway-gc/identity.json.txt)
records one additional gateway collection probe. Both use the same committed
baseline and external policy, without a rule filter, under the 4 GiB/900-second
guard. Both were terminated for `rss_limit`, with empty stdout/stderr and no JSON
report: [first receipt](trace-only/full-base.receipt.json.txt), 54.316 seconds and
4217932 KiB sampled process-tree peak; [second receipt](gateway-gc/full-base.receipt.json.txt),
63.457 seconds and 4196076 KiB. No candidate/fault acceptance comparison exists.

The complete [first trace](trace-only/trace.jsonl.txt) has 2640 events: all 21
configuration captures and 21 import passes complete; backend and frontend
diagnostics return zero errors. Gateway diagnostics do not return before the
resource stop. The [second trace](gateway-gc/trace.jsonl.txt), 4053 events, records
the extra collection immediately before gateway diagnostics. Reported heapUsed
falls by 638493908 bytes (about 609 MiB), and validator RSS by 239595520 bytes
(about 228 MiB). Gateway diagnostics then complete with zero errors. The same
cap is reached later during MCP diagnostics; emission and public-type traversal
are not reached. These observations establish reclaimability at that boundary
and further execution, not a complete fix or a universal memory bound.

`saved-plan-shapes.ts` is merely the last started file in the first trace. It
completed earlier for backend/frontend and subsequently completed for gateway
and MCP in the second trace. The stop marker therefore does not establish that
file as the culprit. Neither trace proves a permanent leak or its absence.
Runtime heap statistics are coarse and sometimes internally surprising; they
are not a live-object census. Guard process-tree RSS and validator self-RSS are
sampled separately, so their maxima are not simultaneous and their difference
does not measure exact launcher overhead. The retained [first findings](trace-only/findings.md.txt)
describe the state before the second probe; its proposed next experiment is
historical, with the outcome retained in [second analysis](gateway-gc/analysis.json.txt).

[The manifest](manifest.json.txt) binds every source file to its original byte
length and SHA-256, distinguishing direct copies from reconstruction recipes.
Complete traces, analyses, patches, preparation scripts, identities and raw
receipts/streams remain exact UTF-8 copies with `.txt` suffixes. The six snapshot
inputs are represented losslessly by [one compact snapshot](snapshots/original.compact.json.txt)
and a [three-entry delta](snapshots/trace-only.delta.json.txt). The compact snapshot
uses ordered directory and value tables plus `[directoryIndex, basename, valueIndex]`
entries. Reconstruct entries in order, apply the optional delta, then serialize
with `json.dumps(snapshot, indent=2)` and one final newline. This recreates each
original snapshot byte for byte; the compact files themselves are not raw copies.

From this folder, run `python3 reconstruct-check.py.txt` to verify every manifest
mapping, or add `--check-sources` to compare the retained `/tmp` originals when
available. Optional `--write-dir /tmp/new-snapshot-directory` writes the two
reconstructed files only after every digest passes; the directory must be new.
The [checker](reconstruct-check.py.txt) has no project or evaluator dependencies.
[The observed proof](reconstruction-proof.json.txt) records a clean comparison,
a temporary-copy mutation of `entries[0][1]` from `artifact.tgz` to
`artifact-mutated.tgz` rejected with `snapshot/source digest mismatch`, then a
restored clean comparison. All six original snapshot inputs matched exact bytes;
the retained compact input's hash stayed unchanged.

No physical consumer, binary archive or large mutant dataset is copied here.
Historical preparation/analysis scripts were not executed while packaging this
folder; only the reconstruction checker was run for this transport proof.
