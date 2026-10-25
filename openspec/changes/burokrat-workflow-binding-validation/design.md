# Optional static validator extraction

This preserves the reviewed standalone binding contract from6f09b11fc. It is an
optional Burokrat command with no persisted runtime consumers. The broader coordinator,
retained RunStore manifest, API and storage choices remain outside this merge.

# Workflow binding validation and selection

Accepted implementation supplement, 2026-10-22. This supplement implements parent tasks 1.1–1.2 only. The binding spec and parent design remain authoritative outside these clarifications. [binding-tasks.md](binding-tasks.md) gives three independent TDD slices. No repository defaults or gate rollout (1.3), executor implementation, network calls, credentials, compute-provider configuration, spending authority or WBS/RunStore writes belong to this packet.

## Version 1 values

All object fields below are required and all undeclared keys are refused, including nested records. All types and returned collections are readonly. Type aliases for domain strings denote checked strings, not unchecked casts or a new authority system.

```ts
type ApiModelClass = {
  readonly executor: 'api-model';
  readonly model: string;
  readonly prompt: string;
  readonly tools: readonly string[];
  readonly limits: { readonly maxSteps: number; readonly maxOutputTokens: number };
};
type CliHarnessClass = {
  readonly executor: 'cli-harness';
  readonly harness: 'claude-code' | 'codex';
  readonly permissionMode: 'read-only' | 'allow-edits';
  readonly prompt: string;
};
type AcpClass = {
  readonly executor: 'acp';
  readonly agent: string;
  readonly prompt: string;
  readonly tools: readonly string[];
};
type ToolClass = { readonly executor: 'tool'; readonly command: string };
type HumanClass = { readonly executor: 'human'; readonly prompt: string };
type ActivityClass = ApiModelClass | CliHarnessClass | AcpClass | ToolClass | HumanClass;
type Binding = {
  readonly version: 1;
  readonly types: Readonly<Record<string, Readonly<Record<string, { readonly class: string }>>>>;
  readonly classes: Readonly<Record<string, ActivityClass>>;
};
type CheckedBinding = { readonly binding: Binding; readonly projectSteps: readonly string[] };
type SelectionIdentity = {
  readonly requestedType: string;
  readonly matchedType: string;
  readonly stepCode: string;
  readonly className: string;
};
type ClassSelection = SelectionIdentity & { readonly settings: ActivityClass };
```

Dictionary keys and class/agent/tool references are nonempty strings with no whitespace. Reject `__proto__`, `prototype`, `constructor` as dictionary keys. Do not impose lowercase `OpaqueId` spelling on WBS type/step codes. Reject empty `types`, `classes` and per-type mappings. Tool arrays may be empty but cannot contain duplicate names. Limits are positive safe integers, without string coercion. No defaults or fallback values are inserted by decoding.

Models are `anthropic:<suffix>`, `openai:<suffix>` or `openrouter:<suffix>`, where suffix is nonempty and contains no whitespace; split at the first colon and preserve the entire suffix, including slash-qualified OpenRouter models. A string without a colon refuses `unpinned_model`; an unrecognized prefix refuses `unknown_provider`; empty or whitespace-bearing suffix refuses `invalid_binding`. Names are pinned configuration, not proof a model exists or a vendor alias is immutable. Unknown executor strings refuse `unknown_executor`; an absent/non-string executor is `invalid_binding`.

Prompt paths use `contracts/records.ts:RelativePath` and additionally refuse drive-qualified paths. They are canonical repository-relative paths: no leading slash, backslash, dot segments, glob characters, empty segment or NUL. `tool.command` is a nonblank whitespace-free registry key (including sample `bin/h2puni-gate.sh`), never shell text to execute during validation. `acp.agent` is a registry key; this packet resolves neither key. Missing trusted runtime registrations must throw at later composition.

Harness permission modes describe desired policy, not backend flags or approval bypass. ACP tool lists describe requested capabilities, not authority. Human prompt describes a decision request; its exact wait target and allowed decisions are runtime facts. There is no tool/human model or API limit field. Executor/tool-policy implementation versions are retained later under parent 6a.3, not invented here.

## Shape and coverage before acceptance

```ts
decodeWorkflowBinding(input: unknown): Binding;
checkWorkflowBinding(binding: Binding, projectSteps: readonly string[]): CheckedBinding;
selectActivityClass(checked: CheckedBinding, typeCode: string, stepCode: string): ClassSelection;
```

`decodeWorkflowBinding` uses ArkType with undeclared-key rejection, returns a detached deeply frozen copy, and names all refusal codes. `checkWorkflowBinding` validates nonempty unique supplied project-step strings, every class reference, and exact step-set coverage for every declared type including `default`. Extra mapped codes refuse `unknown_step`; absent project codes refuse `missing_step`. It checks unused classes too (already decoded). It returns the original immutable binding and a sorted, copied, frozen step set.

`selectActivityClass` selects an own type entry if present, otherwise the complete `default` entry, otherwise throws `unmapped_type`. It never fills an explicit type's missing step from `default`; that binding has already failed coverage. A step outside the checked project set refuses `unknown_step`. The selected settings and identity are frozen. No field is named accepted or digest in this first slice, and no prompt existence is claimed. Lack of a WBS type catalogue means coverage of every possible work-item type is not certified.

## Acceptance from exact prompt bytes

```ts
type PromptSource = { readonly path: string; readonly bytes: Uint8Array };
type PromptSnapshot = {
  readonly path: string; readonly sha256: string;
  readonly text: string; readonly bytesBase64: string;
};
type AcceptanceSnapshot = {
  readonly schemaVersion: 1; readonly binding: Binding;
  readonly projectSteps: readonly string[];
  readonly prompts: readonly { readonly path: string; readonly sha256: string }[];
};
type ValidatedBinding = {
  readonly snapshot: AcceptanceSnapshot; readonly bindingDigest: string;
  readonly prompts: readonly PromptSnapshot[];
};
type SelectedActivity = SelectionIdentity & { readonly bindingDigest: string } & (
  | { readonly settings: ToolClass; readonly prompt: null }
  | { readonly settings: Exclude<ActivityClass, ToolClass>;
      readonly prompt: Pick<PromptSnapshot, 'path' | 'sha256' | 'text'> }
);
acceptWorkflowBinding(checked: CheckedBinding, prompts: readonly PromptSource[]): ValidatedBinding;
selectWorkflowActivity(accepted: ValidatedBinding, typeCode: string, stepCode: string): SelectedActivity;
```

Acceptance requires exactly one source for each unique prompt path in all declared classes, including unused classes; missing/duplicate/extra sources refuse `invalid_prompt_sources`. It hashes original bytes with SHA-256, decodes text with fatal UTF-8, preserves whitespace/newlines, permits empty text, and retains originals as base64. TextDecoder BOM handling does not change the byte digest; never reconstruct originals by encoding text. Snapshot prompt descriptors are sorted by path in UTF-16 code-unit order; project steps are sorted in the same order. Tool-list order remains significant.

`bindingDigest = digestOf(snapshot)` reuses `contracts/canonical.ts`. It covers canonical document semantics, the checked project set and hashes of original prompt bytes. YAML comments/key order and supplied project-step order do not alter it; changing any prompt byte does. SHA-256 collision resistance is assumed. No Git SHA or revision label substitutes for this digest. RunStore's manifest digest may cover additional retained versions and is a different value.

All returned plain objects/arrays are recursively frozen. Input document and step arrays are detached before freezing; previously mutable caller-owned input must remain mutable. Only immutable strings escape byte acceptance. A local byte staging copy is a useful implementation choice, not a separate safety invariant: acceptance is synchronous, and removing that copy need not alter behavior. The actual invariant is that original-byte hashes, base64 originals, decoded text and outer digest correspond; production mutation proofs must target that correspondence and escaped-value independence, not presume that eliminating a copy will fail. Selection returns frozen nested values. Caller mutation of inputs or attempted mutation of outputs must never produce a changed value carrying an old digest. Keep this snapshot logic local to binding contracts, not a generic serialization/storage library. Type shapes are not authorization tokens; arbitrary structurally forged objects are not validated by TypeScript. Persisted/untrusted values must enter through decoding and acceptance again.

The first API adapter will consume the selected API class's model, tools, explicit limits and prompt text/hash. This does not implement SDK enforcement. Parent 6a.3 must retain this snapshot and original bytes before admission; admission later compares the accepted digest. Current source files must not be reread to reconstruct an accepted snapshot during retention or restart.

## Filesystem/YAML and CLI boundary

```ts
readWorkflowBinding(repositoryRoot: string, file: string, projectSteps: readonly string[]): ValidatedBinding;
runWorkflowBindingCommand(args: readonly string[], repositoryRoot: string): string;
```

Both functions live in `src/workflow-binding.ts`; the second is added only in Task 3. The loader decodes/validates YAML, checks references/coverage before reading prompts, then calls pure acceptance. Root is explicitly supplied; CLI supplies `process.cwd()`. Resolve relative binding filenames against root; allow absolute binding filenames. Prompt paths always anchor to root, never the binding's directory. No Git discovery or directory search. A command invoked from a subdirectory uses that subdirectory as root; callers must invoke it from their intended repository root.

Before reading binding bytes, stat the resolved binding filename and require a regular file; refuse a directory, FIFO or device as `invalid_yaml` with detail `binding must be a regular file`. Do not open a preexisting nonregular binding and risk blocking before classification. Then read binding bytes once, using fatal UTF-8. With installed `yaml`, parse one YAML 1.2 document, reject an effective version other than 1.2, inspect parser errors/warnings and nodes, reject duplicate/non-string keys, custom tags, aliases, merge keys, additional documents and non-plain JSON values. Do not coerce mapping keys to strings or interpolate environment variables. Explicit standard tags with ordinary supported scalar/object values are permitted; custom/unknown tags refuse. Class/schema validation follows YAML parsing. Missing version is `invalid_binding`; a present unsupported version is `unsupported_version`.

Prompt path shape is checked before IO. Resolve physical root and prompt paths, refuse a prompt resolving outside root, require a regular file, then read each distinct prompt once. An internal symlink is allowed; an external symlink refuses. This snapshots observed bytes; it is not an atomic checkout or a defense against a hostile concurrent filesystem writer. No ambient clock, network, credentials, command execution or backend availability lookup.

Task 3 parses exactly `['validate', 'workflow-binding', file, '--steps', commaList]`. Reject missing/extra/repeated flags, empty operands and empty/duplicate/whitespace-bearing step segments before filesystem access. Dispatch this prefix before existing `cli.ts` three-argument generic `validate` dispatch, even for malformed arity. Do not add `workflow-binding` to JSON-only `RecordKind` or support it via `validate-record`. Helper returns the digest, and CLI writes `${digest}\n` only after success. Existing `executeCli` catches the named error, prints stderr and sets exit code 1; no success stdout on refusal.

## Named failures

`WorkflowBindingError` extends Error with `readonly code: WorkflowBindingErrorCode`, `readonly path: string`, optional `cause`; constructor `(code, path, detail, options?: ErrorOptions)`. Its message is `${code}: ${path}: ${detail}`. Invalid configuration is refused by throwing, matching existing Burokrat validators. Other unexpected failures rethrow with context; none become valid/default states.

| Codes                                                                                                                     | Boundary                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `unsupported_version`, `unknown_executor`, `invalid_binding`, `unpinned_model`, `unknown_provider`, `invalid_prompt_path` | Document shape/settings                    |
| `invalid_project_steps`, `unknown_class`, `unknown_step`, `missing_step`, `unmapped_type`                                 | Checked selection                          |
| `invalid_prompt_sources`, `invalid_prompt_encoding`                                                                       | Supplied byte acceptance                   |
| `binding_missing`, `binding_unreadable`, `invalid_yaml`                                                                   | Binding/root filesystem and parse boundary |
| `prompt_missing`, `prompt_unreadable`, `prompt_not_file`, `prompt_outside_root`                                           | Prompt filesystem boundary                 |
| `invalid_arguments`                                                                                                       | CLI grammar                                |

ENOENT from binding/prompt resolution or read is the corresponding missing code; EACCES/EPERM/other IO failure is unreadable with cause. An unusable repository root is `binding_unreadable` with logical path `repositoryRoot`. Binding invalid UTF-8, non-file or malformed/multiple YAML documents use `invalid_yaml` with specific detail. Prompt directories/devices use `prompt_not_file`. Schema errors name a logical class/type/step path. Deterministic stage order: YAML → document/version/kind/settings → project-step set → class references → coverage → prompt files/sources/bytes. Within a stage sort dictionary keys by code unit before choosing the first failure.

## Governance remainder and sample limits

Parent 1.1–1.2 completion does **not** complete WBS I1. Its approval-rule/budget declarations remain an explicit unresolved remainder governed by `twilight-control-plane/specs/twilight/control-plane/spec.md` and that change's execution-envelope, approval-subject and run-budget design. Existing Burokrat plan/progress consistency contracts grant no approval/admission and provide no execution-envelope/run-budget record to reuse here. Do not invent opaque authority reference fields. API step/output limits are stopping settings, not spending authority, tenant quota or local capacity.

The amended parent sample adds `review` API settings and an `integrate` human prompt. These illustrate complete references only. Human integration models a wait, not A6's subsequent guarded merge. That composition and production defaults remain unresolved before parent 1.3/runtime integration. No glossary duplication is needed; existing terms suffice.

The current WBS I1.01 row additionally names sandbox kind, tool cwd policy, retry policy
and the broader retained `bindingRevision`; I1.05 adds first-attempt/retry context policy.
Those are explicit follow-on contracts, not implicit defaults in this static v1 subset.
Before runtime dispatch or retry, adapters/coordinator must consume their resolved accepted
policies. The acceptance digest here is not I1.01's complete retained-manifest revision.
I1.01 remains in progress after this subset; I1.02 is accepted only against the explicitly
implemented version and cannot certify deferred fields. Original WBS requirements remain
intact. Unsupported settings refuse rather than being ignored.
