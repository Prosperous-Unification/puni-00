## Why

The installed relationship extractor cannot resolve the named `yaml` import used by tool-fleet platform manifests because the release-owned declaration roots omit that already locked dependency. This leaves REL-EXTRACT refused and blocks WBS120 evidence even when the candidate correctly has no node_modules.

## What Changes

Released packages, toolkits and relocation archives include YAML declarations through their existing shared trusted dependency closure. Installed extraction resolves `parseAllDocuments` and public return declarations from that closure without consulting candidate dependencies.

## Non-Goals

No WBS120 completion, prerequisite130 completion, trusted activation, relationship-rule relaxation, candidate-driven enrollment, dependency update, deployment or general declaration discovery.

## Constraints

Preserve nested/transitive resolution and all existing absent, unreadable, malformed and symlink refusals. Root package.json already pins yaml through the existing lockfile. Keep local checks focused and serial; packaged installed-consumer proof and full acceptance run on the hosted heavy lane.

## Capabilities

### New Capabilities

- `yaml-trusted-declarations`: Installed relationship extraction resolves YAML from the release-owned closure and refuses missing or altered trusted bytes.

### Modified Capabilities

None.

## Domain Terms

None. Existing declaration and relationship terminology applies.

## Decisions Recorded

None. This extends the established shared closure without a new authority or architectural decision.

## Impact

Twilight Burokrat trusted declaration roots and its existing installed-consumer test; no dependency or lockfile changes.
