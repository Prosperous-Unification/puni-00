## Why

Twilight Bureaucrat is meant to hold the templates for artifacts the system generates, but it has none. A generator and a validator that carry separate ideas of a module can drift, and an agent has no single record of what a module must contain.

## What Changes

Twilight Bureaucrat gains a registry of four templates: module, feature-service, resource-service, and repository. Each template carries both the skeleton a generator instantiates and the machine-readable constraints its output must satisfy. New `template list`, `template show`, and `template verify` routes expose that record and judge one artifact selected from a Git revision.

Verification evaluates exactly the constraints the selected template states, decodes and parses every selected TypeScript file before judging it, and reads declarations only from real line comments. It is pure, deliberately narrower than the direction rules, never certifies, and enforces nothing in the gate.

## Non-Goals

This change adds no rule, mode, policy field, consumer override, version pinning, generation, or edit to an existing service. It does not resolve type-only imports or add a wiki index envelope to module README output.

## Constraints

A service file declares its capability, glossary term, or port in a line comment because unknown JSDoc tags fail lint. A purely type-only import remains invisible to the import scanner. Module README output omits the wiki index envelope because no current frontend module carries one. Missing, unreadable, malformed, or wrongly scoped candidate input is refused rather than defaulted.

## Capabilities

### New Capabilities

- `bureaucrat-templates`: Lists and shows shared artifact templates and verifies one candidate artifact against the constraints in its template record.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

Only the `twilight-bureaucrat` project changes. Its validator identity changes because new source files enter the command-line import closure.
