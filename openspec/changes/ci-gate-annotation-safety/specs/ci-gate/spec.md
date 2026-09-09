## ADDED Requirements

### Requirement: Retained CI diagnostics cannot execute workflow commands

The CI gate SHALL render each line of its bounded retained-log tail with a non-command prefix after
splitting bare CR, LF, and CRLF boundaries. It SHALL render remaining C0 and DEL bytes visibly.

#### Scenario: A log contains command-shaped output after bare CR

- **WHEN** the retained log contains a workflow command at column zero after a bare CR
- **THEN** the displayed tail contains that text only after the non-command prefix

### Requirement: Unsafe annotations fail closed with a bounded explanation

The helper SHALL reject located annotation commands containing C0 or DEL bytes. If at least one is
rejected, it SHALL emit exactly one fixed diagnostic without any rejected command text. Before the
runner handles an accepted command, printable percent spellings SHALL remain unchanged: the runner
decodes `%0A`, `%0D`, and `%25`, while `%09` remains four literal characters and is not a raw tab.

#### Scenario: Bun emits a tab-bearing assertion

- **WHEN** the production helper reads a located assertion containing a literal tab
- **THEN** it omits that annotation and emits only the fixed rejection diagnostic
