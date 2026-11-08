# Physical proposal evidence classification review

Reviewed 2026-11-05 against the six-path uncommitted repair/publication in `/home/df/.codex/worktrees/13fb/puni-00`, HEAD `8f2ead16a3ff639e7c04d97c48c2991470bab775`. Root task instructions and worker report/native evidence were read. Review used read-only source, Git, and evidence inspection; no tests, archived mutation runners, Git/index changes, or source edits were performed. This report is the only written artifact.

## Assessment

No Critical or Important findings. One Minor documentation finding, M1 below, requires a narrow cutoff clarification. The policy implementation, unique native proof evidence, and proposal-only scope are sound. Root may make the described clarification and obtain a short readback before its remaining normal validation/commit workflow.

This review does not adopt the physical-store proposal, close provider acceptance, certify future publication copies, approve migration/production actions, or grant current hosted/canonical acceptance.

## Exact source and behavior evidence

The exact diff adds one nine-line declaration per shipped policy, four adjacent proof-comment lines, an existing-publication appendix, and two UTF-8 JSON evidence files. No assertions, classifier/schema, dependencies, protocol, or product behavior were edited. Independently removing only the new archive row from each complete current policy produces its retained original JSON exactly; those originals equal `git show HEAD:<policy>`. All ten parent PostgreSQL rows and every other prior policy value remain unchanged.

The declared path is the already committed `openspec/changes/workflow-postgres-provider/evidence/postgres-physical-store-design-20261105.json.gz`, with `application/gzip`, its existing directly citing publication consumer, and external historical regeneration authority. Actual archive bytes equal HEAD's Git blob, the retained 103,982-byte capture, SHA-256 `e2b5c9c871bb6708eadfabc67be26cdae2987424b624bb38eefd6c8d188ed8e1`, and one-tuple fixture identity `ed3fc24d7783563462752b5f4ad8fe41227e2412`.

Independently audited all 45 captures listed in the final native summary: argv, native code/null signal, FD-closure records, raw stdout/stderr lengths and digests, frozen helper/launcher/harness identities, inputs, and source snapshots. Two source sets bind 506 production-source identities to current files or preserved before-snapshots. The only changed captured inputs are the authorized two policy writes and documentation/proof-comment write. All six nonzero outcomes are the expected two original-policy refusals, two row-omission refusals, and two same-byte unlisted refusals; each has empty stdout and the exact named undeclared-binary diagnostic.

Each omission input equals the original classification policy, and each restored input equals the complete corrected classification policy. Both restoration captures emit the exact one-entry binary/format/consumer/external-authority metadata. The frozen experiment compares the complete restored payload with its initial accepted payload. The two-tuple unlisted control records identical declared/unlisted blob identities matching HEAD's archive and both refusals name the sibling.

The unchanged key pilot receipt records 2 pass / 0 fail / 73 assertions, with the actual two case names. The fixture construction clones current HEAD and overlays both corrected policy files before its own commit, so the committed archive and repair are selected without a root commit checkpoint. No broader test claim is made. All eight relative links in the publication resolve; the consumer cites the exact archive. Owned classifier and decoded-verification directories are absent.

The independent audit completed with:

```json
{
  "sourceAndProvenanceAudit": "passed",
  "exactPolicies": 2,
  "priorValuesUnchanged": true,
  "archiveMatchesHead": true,
  "nativeCaptures": 45,
  "intentionalNonzero": 6,
  "sourceSets": 2,
  "sourceIdentities": 506,
  "controls": 2,
  "restorations": 2,
  "unlisted": 2,
  "keyPilot": { "pass": 2, "fail": 0, "assertions": 73 },
  "relativeLinks": 8
}
```

## Publication integrity and completeness

Verified strict UTF-8 and packet SHA-256 `6589d7c99d30b1e8a0dcd0dd1514f6d1cdd80b8fb5c14f47f18e9d97b627c14b`, canonical base64, compressed/decoded lengths and hashes, every chunk length/digest, every ordered reconstruction, and every full file length/digest. The inner packet has 544 files, 1,970 chunks, and 37 completed captures; the manifest adds 65 distinct later files for 609 reconstructed files total. The initial reviewed manifest SHA-256 is `0364661983d6aa012787701230ffe27035de55afeb0b5b045a7a5187f437d10b`.

Of those reconstructed files, 608 equal their current original local bytes exactly. The remaining file is the historical `progress.md` snapshot described in M1. All unique controls, sources, input snapshots, immutable helper versions, 45 completed receipts/streams, verification records, final reports and closing helper source are retained. Exactly seven additional live local files are outside the publication: the explicitly excluded closing transport's receipt/helper/start/PID/source-snapshot/stdout/stderr. Separately verified its code 0, null signal, stream lengths/hashes, and closing output's packet/manifest/report identities. The closing transport is excluded to avoid self-reference, rather than represented as already contained in its own publication.

Read the production scanner and the executed verification/closing helpers. Their retained successful native records support 544 plus 65 actual decoded-file scans and zero findings. Their exact before-snapshot scanner hash matches the recorded scanner identity. No scanner/test replay was needed for this review. No assertion that every current local narrative byte was scanned or published should follow from those snapshot counts.

## Minor M1 — explicitly identify the historical progress snapshot

Location: `postgres-physical-store-classification-manifest.json` field `postCutScope`, alongside the publication appendix's cutoff explanation. The manifest currently says every original file and later completed evidence is included, with only closing transport and later root checks excluded. However, the closing helper appended 457 bytes to `progress.md` after packing, and its additional-file selection skips all paths already in the inner packet. Consequently the final appended progress version is not retained, while the original historical snapshot is retained correctly.

The inner snapshot SHA-256 is `7094a1f864d361d4dd4db34af78b02f5f3f988b4cf2a04f28ba5fe106f3ffe4a`; the current append-only version is `5c3d8d422f26d2123ae59bd831c47ba8cdf031e59897932a24c8b2a2d8dc163f`. The append repeats closing-publication and final-check status already in the retained final report and native receipts. No unique control, source, input, or failure observation is lost, so this is a Minor scope-description issue, not an implementation or proof gap.

Root selected the appropriate narrow fix: explicitly state in the manifest and appendix that the inner progress log is the pre-close snapshot and the later duplicate narrative append is excluded. Preserve original snapshot bytes and native observations. This report releases the source hold for those two documentation fields; a small subsequent readback will resolve M1. Do not claim 609 reconstructions equal all current local file versions.

## Read boundaries and skipped checks

Read the root task, exact six-path diff, worker report/native summary, capture/experiment/publication/final-audit/closing helpers, control input policies and identities, all 45 listed receipt/stream/source-snapshot records, both evidence layers, closing transport, scanner, direct consumer and link targets. Prior production classifier/schema and pilot construction remain unchanged from the earlier reviewed parent repair; this diff does not introduce a new executable guard requiring guard-removal proofs.

Did not rerun tests, format, lint, typecheck, OpenSpec, hooks, or hosted/canonical gates, and did not rely on root's concurrently running checks. Did not deeply reassess the older compressed physical-design research, proposal architecture, full provider protocol, runtime PostgreSQL execution, fixture durability, or owner decision. Those remain separate and unproved by this classification repair.
