## ADDED Requirements

### Requirement: A validated binding names the activity for a step

A repository SHALL hold one workflow binding, `.twilight/workflows.yaml`, that maps work item type and step code to an activity class with an executor kind and its pinned settings. Twilight Burokrat SHALL validate it without a clock, network or credentials, given the step codes the project holds. Twilight Dash SHALL run only a binding Burokrat accepted at the same revision.

Version 1 SHALL use the strict discriminated shapes in `binding-design.md`: `api-model` with provider-qualified model, prompt, tools and explicit positive safe-integer step/output limits; `cli-harness` with harness, permission mode and prompt; `acp` with agent registry name, prompt and tools; `tool` with command registry name; `human` with prompt. Every declared field SHALL be checked, undeclared fields SHALL be refused, and missing settings SHALL NOT be defaulted. No backend registry resolution or authority decision is implied by shape acceptance.

Every declared class, including an unused class, SHALL be checked. Every mapped class SHALL exist. Every declared type mapping, including `default`, SHALL contain exactly the supplied unique nonempty project-step set. An explicit type SHALL be selected as a whole; `default` SHALL be selected only when the requested type is absent. An explicit type SHALL NOT inherit missing steps from `default`. A missing requested type with no default SHALL be refused. This validation SHALL NOT claim coverage of WBS types that were not supplied.

Burokrat SHALL throw a named refusal code and affected logical path for invalid configuration. Unknown version, executor, bare model, unknown provider, dangling class, unknown step, missing step and missing type fallback SHALL respectively use `unsupported_version`, `unknown_executor`, `unpinned_model`, `unknown_provider`, `unknown_class`, `unknown_step`, `missing_step`, and `unmapped_type`. Other strict shape errors SHALL use `invalid_binding`, invalid prompt path syntax `invalid_prompt_path`, and malformed supplied project-step sets `invalid_project_steps`.

#### Scenario: A complete binding is accepted

- **WHEN** `twib validate workflow-binding .twilight/workflows.yaml --steps plan,impl,review,verify,integrate` runs on a complete binding naming those codes with pinned model settings and present readable prompts
- **THEN** it prints only the acceptance digest followed by a newline and exits 0

#### Scenario: A step code the project lacks is refused

- **WHEN** the binding maps `change.qa` and the project's step codes are `plan,impl,review`
- **THEN** validation exits non-zero with `unknown_step`, naming `qa`, and emits no success stdout

#### Scenario: An incomplete explicit mapping does not inherit

- **GIVEN** `default` contains all supplied project steps and `change` contains only `plan`
- **WHEN** the project also supplies `impl`
- **THEN** validation refuses `missing_step` for `change.impl` instead of borrowing `default.impl`

#### Scenario: A type falls back only as a whole

- **GIVEN** an accepted complete default mapping and no `incident` mapping
- **WHEN** selection requests `incident.review`
- **THEN** it returns the default review class with requested type `incident` and matched type `default`

#### Scenario: A dangling sample class is refused

- **WHEN** `change.review` names class `review` but the classes dictionary does not define it
- **THEN** validation refuses `unknown_class` even if all project step codes are present

#### Scenario: An unpinned model is refused

- **WHEN** a class names `model: gpt-6-sol`
- **THEN** validation refuses `unpinned_model` and names the `provider:model` form

#### Scenario: Dash refuses an unvalidated binding

- **WHEN** `run-coordinator` is given a binding whose digest does not match the accepted one recorded for the revision
- **THEN** it refuses to admit any attempt and names both digests

### Requirement: Acceptance binds immutable prompt snapshots at a deterministic file boundary

The pure class-selection API SHALL distinguish shape/coverage checking from acceptance with prompt bytes. It SHALL NOT publish an acceptance digest before verifying the complete prompt-source set. Pure acceptance SHALL require exactly one original byte source per unique declared prompt path, reject missing/extra/duplicate sources as `invalid_prompt_sources`, decode text with fatal UTF-8, and reject malformed text as `invalid_prompt_encoding`.

The filesystem loader SHALL resolve prompt paths relative to an explicitly supplied repository root; the CLI SHALL supply its working directory as that root. The binding filename SHALL NOT establish the prompt root. The loader SHALL refuse prompt paths resolving outside the physical root, permit internal symlinks, require regular prompt files, and read each distinct prompt's bytes once. The snapshot represents observed bytes, not an atomic repository revision under concurrent mutation.

The loader SHALL stat the resolved binding file and require a regular file before reading bytes. A directory, FIFO or device SHALL refuse `invalid_yaml` without opening it for a byte read. Binding input SHALL be strict single-document YAML 1.2. Duplicate/non-string keys, aliases, merge keys, custom tags, parser errors/warnings, invalid UTF-8 and values outside the strict document schema SHALL be refused. Binding parsing SHALL perform no environment expansion.

The CLI SHALL recognize the `validate workflow-binding` prefix before generic record validation and SHALL require exactly `<file> --steps <comma-list>`. Invalid arity, flags and empty/duplicate/whitespace-bearing code segments SHALL refuse `invalid_arguments` before filesystem access. This command SHALL NOT be added to the JSON-only `validate-record` alias. Refusal SHALL exit 1 with a named diagnostic and no success stdout.

The acceptance snapshot SHALL contain schema version 1, the canonical binding, sorted project-step set and sorted unique prompt path/original-byte SHA-256 descriptors. Its digest SHALL be lowercase SHA-256 of the existing Burokrat canonical JSON representation. Returned prompt snapshots SHALL retain both decoded text and original bytes as base64. Returned objects/arrays SHALL be immutable and detached from caller input; previously mutable caller-owned inputs SHALL remain mutable; an old digest SHALL never remain attached to caller-modified settings or prompt content. YAML presentation changes SHALL NOT change acceptance; original prompt-byte changes SHALL change it. This acceptance digest SHALL be distinct from any broader retained RunStore manifest digest.

Acceptance SHALL establish only static consistency and referenced-byte integrity. It SHALL NOT certify backend availability, tool registration, permissions, approval validity, spending authority, execution completion or recovery. API step/output limits SHALL NOT be treated as run budgets. Approval-rule and budget declarations remain a separate I1 governance requirement under the existing Twilight control-plane contracts.

#### Scenario: Prompt paths use the invocation root

- **GIVEN** a binding at `<root>/.twilight/workflows.yaml` naming `.twilight/prompts/plan.md`
- **WHEN** validation runs with `<root>` as its working directory
- **THEN** it reads `<root>/.twilight/prompts/plan.md`, without adding a second `.twilight` directory

#### Scenario: Absent and unreadable prompts remain distinct

- **WHEN** a named prompt is absent
- **THEN** validation refuses `prompt_missing`
- **WHEN** an existing prompt cannot be read because of filesystem permissions
- **THEN** validation refuses `prompt_unreadable`, preserves the IO cause, and never substitutes empty text

#### Scenario: A prompt escapes the root or is not a file

- **WHEN** a prompt symlink resolves outside the supplied root
- **THEN** validation refuses `prompt_outside_root`
- **WHEN** a prompt is a directory or other non-regular file
- **THEN** validation refuses `prompt_not_file`

#### Scenario: Binding absence and unreadability remain distinct

- **WHEN** the binding file is absent or cannot be read
- **THEN** validation respectively refuses `binding_missing` or `binding_unreadable`
- **WHEN** readable binding bytes are not valid supported YAML
- **THEN** validation refuses `invalid_yaml` without manufacturing a default binding

#### Scenario: A nonregular binding refuses before byte reads

- **GIVEN** the binding filename denotes a directory or other nonregular file
- **WHEN** the loader validates the binding
- **THEN** it refuses `invalid_yaml` naming the regular-file requirement before reading bytes

#### Scenario: Original referenced bytes define acceptance

- **GIVEN** a previously accepted binding and its unchanged YAML file
- **WHEN** a referenced prompt byte changes, including a BOM or newline
- **THEN** newly accepting that binding yields a different digest
- **WHEN** only YAML comments/key order or supplied project-step order changes
- **THEN** the digest remains equal

#### Scenario: Caller mutation cannot invalidate the digest silently

- **GIVEN** acceptance returned a snapshot after hashing supplied prompt buffers
- **WHEN** the caller modifies original document fields, step arrays or prompt buffers, or attempts to mutate returned nested settings/content
- **THEN** the original caller-owned inputs remain mutable, while the accepted snapshot and digest remain unchanged and match each other

#### Scenario: Malformed binding CLI does not reach generic record decoding

- **WHEN** `twib validate workflow-binding missing.yaml` omits `--steps`
- **THEN** it refuses `invalid_arguments` before any read or generic RecordKind validation

### Requirement: Runs retain immutable execution-binding manifests

Before admission Dash SHALL retain the accepted canonical binding, schema version, digest
and immutable referenced prompt/tool-policy/executor versions. Secrets SHALL remain external
references. Existing runs SHALL reload this retained manifest rather than the current file;
file edits SHALL affect future runs only. Explicit authorization revocation MAY stop existing
runs independently. Re-pinning SHALL be an expected-revision transition that fences affected
work and invalidates changed activities and their downstream provenance closure.

#### Scenario: The working-tree binding changes before restart

- **WHEN** an existing run restarts after the live binding or a prompt file changes
- **THEN** it uses its retained manifest and content versions, or refuses missing/corrupt retained content

#### Scenario: A prerequisite changes but its consumer's class does not

- **WHEN** re-pinning changes an upstream activity's configuration or accepted input
- **THEN** the downstream output is invalidated unless an explicit validated provenance mapping permits reuse
