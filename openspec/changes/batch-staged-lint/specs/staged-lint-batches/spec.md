## ADDED Requirements

### Requirement: Complete sequential lint coverage

The pre-commit lint hook SHALL retain its existing source-file glob and lint every supplied path once using the installed ESLint and unchanged workspace configuration. It SHALL partition paths by nearest existing Nx project root, use an explicit workspace batch for paths without a project, and finish each child process before starting the next. It SHALL preserve filenames as arguments and retain the workspace working directory.

#### Scenario: Multiple projects and workspace sources

- **WHEN** staged source paths include two projects, a nested project and a workspace source
- **THEN** the hook runs distinct sequential ESLint processes covering every supplied path exactly once, with the nested project separate and workspace files included

#### Scenario: Spaces and option-like names

- **WHEN** supplied source paths contain spaces or begin with a hyphen
- **THEN** ESLint receives those filenames as paths rather than split arguments or options

### Requirement: Failed or unknown lint blocks commits

The hook MUST reject a commit when any lint batch fails or is interrupted, when the installed executable is absent, or when a present project manifest is unreadable or malformed. Ordinary absence of a project manifest SHALL mean the search continues toward the workspace root. It SHALL preserve real ESLint diagnostics and SHALL NOT treat a failed child as a passing batch.

#### Scenario: Violation in a later batch

- **WHEN** the first project is clean and a later project or workspace batch violates an enabled ESLint rule
- **THEN** the hook exits nonzero with the actual rule diagnostic

#### Scenario: Broken execution dependency

- **WHEN** the installed ESLint executable is absent or a child terminates without a normal exit
- **THEN** the hook fails and reports the failing dependency or process

#### Scenario: Unknown project metadata

- **WHEN** a present project manifest is malformed or cannot be read
- **THEN** the production hook fails instead of silently assigning its source to the workspace batch
