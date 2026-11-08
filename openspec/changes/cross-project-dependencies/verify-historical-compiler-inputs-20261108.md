# Historical compiler input separation

The ready cleanup repair changes production owner and complete-exclusion source
bytes. Existing finite historical compiler tests read those live paths against
fixed `ordinary-febb-custody-v1` pins. Their positive fixtures must remain the
historical source epoch; changed current source must still refuse old authority.
This test-only repair changes no production behavior, native source authority,
private constructor, accepted image, R2 overlay or historical proof bytes.

Seventeen original blobs were extracted from exact Git commit
`febb1c24427b2d368aa2d6446d6000dc1faabdb3`, with every blob's size and SHA-256
checked against the unchanged existing pins before writing. Total source bytes:
394,068. The new `.txt` archive and fixed manifest live under
`tools/tool-remote-scripts/src/fixtures/ordinary-febb-sources/`. The manifest
SHA-256 is `32eb50afffbc0eeeeabb02baee4b8df4a3848426886297a4657ffa76c33b86f3`.

`readHistoricalSources` is test-only. It accepts exactly the fixed canonical
manifest, reads all seventeen explicit archived paths and requires each original
length/hash. Missing, unreadable, changed, missing-roster and duplicate-roster
inputs throw. It never falls back to current checkout bytes or runtime Git.
Logical source roots only construct the existing planner map keys. Thirteen
historical input loops, the fixed-pin assertion and the coupled negative base-map
consumer use it; original planner/cut/receipt assertions and all existing epoch,
image, packet, prefix and authority pins remain unchanged.

Observed evidence:

- Initial preimplementation run refused the missing reader module; this was an
  implementation-absence error, not a production refusal proof.
- The restored archive reader suite passed nine cases and 68 assertions,
  including actual filesystem ENOENT/EACCES for manifest and source, altered
  manifest, same-length byte corruption, missing and duplicate source rows.
- Omitting only the new manifest guard made its altered-manifest negative resolve
  instead of refuse. Omitting only the byte-authentication guard made its
  same-length corruption negative resolve. Each final consumer failed once;
  restoring the same guards restored the complete nine-case pass.
- Thirty-nine selected finite historical planner, import-free VM ledger and
  callback receipt consumers passed, 983 assertions. No generated image build,
  actual native helper, private historical constructor, production checkout
  overlay, host operation or full storage suite was executed. Existing coupled
  planner calls exercise their in-memory transformation model without
  materializing or executing an image or helper.
- Controlled current-source drift reads actual owner and complete-exclusion bytes
  and appends a benign source comment; both unchanged old planners refuse before
  transformation. Temporarily omitting only the first planner pin guard changed
  refusal to the materializer's later guard and failed both exact-boundary
  assertions. This proves first-refusal classification only; it does not prove an
  independent admission bypass. Both old guards remain byte-for-byte unchanged.

Independent Astra review compared all seventeen archive blobs to Git and the old
pins and found no source issue in this bounded repair. Final statics and evidence
freeze are recorded in the handoff. After ready reconciliation, separate raw
current owner/complete inputs must have different hashes from the old pins and
must refuse the old planner without an appended comment. That integration proof
is still required; no native or current-source qualification is claimed here.
