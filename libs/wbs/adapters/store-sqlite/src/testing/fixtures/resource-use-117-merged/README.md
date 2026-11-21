This fixture records an actual guarded 116 to 117 step merge performed on
2026-11-18. Current Source stores first registered the broad resource use,
claimed the legacy step and retained its runtime binding. The materializer
changed the live claim from `z-resource-dev` to `a-resource-dev`; resource-use
rows, events, runtime binding JSON and runtime ledger stayed byte-exact.

The manifest pins the final database and logical state. `before117.db` and its
historical report retain the pretransition witness. `acquisition.json` records
the native receipt and source identities; the archived producer is excluded
from normal test collection. Absolute historical paths and backup reports are
provenance, not reusable operator authority.

Tests must verify the pins and copy the database to a fresh owned mode-0600
file before applying migrations. Preserve these bytes when testing current
semantic step identities; never rewrite immutable binding JSON to fit them.
