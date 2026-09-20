## ADDED Requirements

### Requirement: The depth-sensitive inventory is checked against an independently derived enumeration

The workspace inventory check SHALL compare `readDepthSensitiveConfigPaths`'s output with a second enumeration that discovers configuration files by walking the application and library trees and extracts parent-relative values with a streaming JSONC visit, and SHALL NOT pin a row total or a file total as a literal.

#### Scenario: A project gains a parent-relative target path

- **WHEN** an existing target's command in a project manifest gains a parent-relative path
- **THEN** the check passes with no edit to the test file, because both enumerations report the new value

#### Scenario: The collector filters a property kind

- **WHEN** `collectParentRelativePaths` stops reporting output-directory values
- **THEN** the check fails, naming every such row the derived enumeration still finds

#### Scenario: Configuration discovery narrows

- **WHEN** `isProjectConfig` stops matching the suffixed TypeScript configurations, or the project filter stops matching the library tree
- **THEN** the check fails, naming the rows the derived enumeration still finds

#### Scenario: The derived enumeration collapses

- **WHEN** the derived enumeration returns fewer than one hundred rows
- **THEN** the check fails on that assertion instead of passing vacuously against an equally empty inventory

### Requirement: The derived enumeration refuses a configuration file it cannot parse

The derived enumeration SHALL collect the JSONC visitor's parse errors and SHALL throw, naming the workspace-relative file and its error codes, rather than reporting the values the tolerant visitor emitted before the error.

#### Scenario: A configuration file is malformed

- **WHEN** an application configuration file is truncated so that its closing brace is absent
- **THEN** the check fails with a refusal naming that file, and no partial inventory is reported

#### Scenario: The production parser no longer refuses it

- **WHEN** the production inventory's own parse-error check is disabled and the same file is malformed
- **THEN** the derived enumeration's own boundary refuses it, naming the same file

### Requirement: A legacy-root occurrence is identified by its text and class, never by its line number

The legacy-occurrence check SHALL key each context by the file, the matched legacy root, the class the classifier gave it and the whole trimmed source line, SHALL keep duplicate contexts rather than de-duplicating them, and SHALL NOT include the line number.

#### Scenario: An unrelated line is added above a classified occurrence

- **WHEN** a comment line is inserted above a classified legacy-root occurrence in a scanned source file
- **THEN** the digest, the occurrence count, the category counts and the unclassified list are all unchanged and the check passes with no edit

#### Scenario: A legacy root moves from a comment into executable text

- **WHEN** a legacy root is removed from a proof comment and added to an executable line in the same classified file, leaving the occurrence count and every category count unchanged
- **THEN** the digest changes and the check fails

#### Scenario: Two occurrences silently exchange their classes

- **WHEN** one occurrence's class is exchanged with another occurrence's class, leaving the occurrence total and every category count unchanged
- **THEN** the digest changes and the check fails

#### Scenario: An occurrence is unclassified

- **WHEN** a scanned file gains a legacy root that no classification rule covers
- **THEN** the check fails with that context in the unclassified list, and the context carries no line number

### Requirement: An unmerged index is refused rather than counted

The candidate enumeration SHALL refuse to proceed when the index holds any unmerged entry, naming each conflicted path, because the underlying listing reports a conflicted path once per stage and every count and digest built on it would otherwise be silently multiplied.

#### Scenario: A merge is in progress

- **WHEN** the index holds unmerged entries
- **THEN** the enumeration throws, naming each conflicted path, instead of returning a listing with repeated paths

#### Scenario: The index is clean

- **WHEN** the index holds no unmerged entry
- **THEN** the enumeration proceeds unchanged
