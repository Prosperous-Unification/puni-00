## Why

Twilight Burokrat has four registered rules and refuses `ratchet` by name, so the repository's decided taxonomy rules are not judged and consumers cannot adopt them module by module.

## What Changes

Twilight Burokrat accepts `ratchet` only when the consumer's trusted policy supplies an adopted set. A ratcheted finding inside that set refuses the candidate; one outside it remains visible as debt.

Eight rules join the registry: F1 and F7, K2 through K6, and the module-layout rule. Kind direction is judged on the extracted import graph, including resolved aliases and transitive re-exports, so a barrel cannot hide a forbidden kind.

## Non-Goals

This change does not implement K7, K8, K9, touched-code ratcheting, file moves, kind-suffix adoption, ESLint fences, a size-ceilings document, or a rule policy for this repository. Touched-code ratcheting requires an explicit comparison base resolved to a tree identity and recorded in the verdict.

## Constraints

The candidate cannot select the trusted policy that judges it. A verdict remains a pure function of the frozen candidate and trusted inputs and never certifies. Every unevaluated rule disallows in every mode, and every new check needs an observed production-path negative.

## Capabilities

### New Capabilities

- `burokrat-rules`: Adds adopted-set ratcheting and the B2 taxonomy, code-shape, and module-layout rules.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None. This change implements [ADR 0029](../../../docs/adr/0029-services-have-a-kind-and-one-direction.md).

## Impact

Only the `twilight-burokrat` project, its proposed rule capability, and the proposed `service-taxonomy` ratchet requirement change. Existing commands and certification behavior remain unchanged.
