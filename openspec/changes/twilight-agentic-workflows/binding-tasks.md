# Workflow Binding Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Burokrat's static binding v1 validation, prompt-byte acceptance snapshot and CLI for parent 1.1–1.2 without claiming runtime authority or completion of WBS I1.

**Architecture:** Pure ArkType contracts first expose checked class selection with no acceptance digest. A second slice accepts exact prompt bytes and adds the filesystem/YAML loader; the final slice routes the existing CLI through it. Reuse Burokrat canonical hashing and error-boundary patterns.

**Tech Stack:** Bun 1.4.2, TypeScript, ArkType via `@shared/validation`, installed `yaml`, Node filesystem/crypto APIs, Bun tests and Nx targets.

**Spec:** `openspec/changes/twilight-agentic-workflows/specs/twilight/workflow-binding/spec.md`; companion `binding-design.md` specifies all types, invariants and refusal codes.

## Global Constraints

- “Twilight Burokrat SHALL validate it without a clock, network or credentials, given the step codes the project holds”.
- “Secrets SHALL remain external references.” No secret/reference resolution is added here.
- Parent 1.1–1.2 only. Keep 1.3 and I1's approval/budget, sandbox/cwd, retry/context-policy and complete-manifest remainder open; no adapters, RunStore/WBS writes, default repository bindings or gate-script changes.
- No stub/fake acceptance value in Task 1. Every exported intermediate API must state exactly what it checked.
- Each new safety guard needs a production-path negative observed with that guard removed/dependency broken, then an adjacent factual `Proof:` comment. Do not prewrite observed evidence.
- No dependency install/version changes. All commands below are intended execution commands, not claims they were run while drafting. Commands run from repository root unless stated otherwise. Every Bun test file operand must start with `./`; unanchored operands previously collected generated dist tests and caused loader errors in this session. Nx checks disable daemon/plugin isolation and skip cache for fresh output.
- Root controls implementation dispatch and integration. Implementers do not spawn agents or commit; root owns dispatch and commits. Each slice ends at a root review checkpoint.

---

## File map

All source paths below begin `apps/twilight-structure/twilight-burokrat/cli/` (shown fully in each task).

- `src/contracts/workflow-binding.ts`: strict class/document schemas, named errors, immutable decoded values.
- `src/contracts/validate-workflow-binding.ts`: exact coverage, checked selection, later byte acceptance and accepted selection.
- `src/contracts/workflow-binding.test.ts`: pure production contract tests.
- `src/contracts/canonical.ts`: add raw-byte SHA-256 helper beside existing canonical-object digest; no evidence-layer import.
- `src/workflow-binding.ts`: real YAML/filesystem loader and later command grammar; no clock/network/backend calls.
- `src/workflow-binding.test.ts`: loader and CLI-boundary tests.
- `src/contracts/index.ts`, `src/cli.ts`: exports and early command routing.
- `README.md`: command grammar, cwd anchor and limited meaning of validation. Parent `verify.md`: observed commands/R5 evidence only; root owns broader completion marking.

### Task 1: Strict classes, exact step coverage and truthful selection

**Files:**

- Create: `apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.ts`
- Create: `apps/twilight-structure/twilight-burokrat/cli/src/contracts/validate-workflow-binding.ts`
- Create: `./apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.test.ts`
- Modify: `apps/twilight-structure/twilight-burokrat/cli/src/contracts/index.ts`

**Interfaces:**

- Consumes `type`, `parseOrThrow` from `@shared/validation`, existing `RelativePath` from `./records`. Read `navigator-records.ts` for `.onUndeclaredKey('reject')`, and `validate-plan-tasks.ts` for pure checks; reuse patterns, not unrelated record types.
- Produces `Binding`, `ActivityClass` and its five variants, `CheckedBinding`, `ClassSelection`, `WorkflowBindingErrorCode`, `WorkflowBindingError` exactly as `binding-design.md` defines.
- Produces `decodeWorkflowBinding(input: unknown): Binding`; `checkWorkflowBinding(binding: Binding, projectSteps: readonly string[]): CheckedBinding`; `selectActivityClass(checked: CheckedBinding, typeCode: string, stepCode: string): ClassSelection`.
- Produces no digest, prompt snapshot, acceptance function, filesystem API or `ValidatedBinding` yet. Error union may add the later boundary codes in their owning tasks, keeping existing codes stable.

- [x] **Step 1: Write strict-class and coverage red tests.** Add this real contract fixture and representative assertions; imports name the production functions being added.

```ts
import { expect, test } from 'bun:test';
import { decodeWorkflowBinding } from './workflow-binding';
import { checkWorkflowBinding, selectActivityClass } from './validate-workflow-binding';

const steps = ['api', 'harness', 'acp', 'tool', 'human'];
function fixture() {
  return {
    version: 1,
    types: {
      default: {
        api: { class: 'api' },
        harness: { class: 'harness' },
        acp: { class: 'acp' },
        tool: { class: 'tool' },
        human: { class: 'human' },
      },
    },
    classes: {
      api: {
        executor: 'api-model',
        model: 'openrouter:openai/gpt-6-sol',
        prompt: '.twilight/api.md',
        tools: [],
        limits: { maxSteps: 2, maxOutputTokens: 80 },
      },
      harness: {
        executor: 'cli-harness',
        harness: 'codex',
        permissionMode: 'read-only',
        prompt: '.twilight/harness.md',
      },
      acp: { executor: 'acp', agent: 'review-agent', prompt: '.twilight/acp.md', tools: [] },
      tool: { executor: 'tool', command: 'bin/h2puni-gate.sh' },
      human: { executor: 'human', prompt: '.twilight/human.md' },
    },
  };
}
test('selects a whole default type without claiming acceptance', () => {
  const checked = checkWorkflowBinding(decodeWorkflowBinding(fixture()), steps);
  expect(selectActivityClass(checked, 'change', 'tool')).toEqual({
    requestedType: 'change',
    matchedType: 'default',
    stepCode: 'tool',
    className: 'tool',
    settings: { executor: 'tool', command: 'bin/h2puni-gate.sh' },
  });
  expect(Object.hasOwn(checked, 'bindingDigest')).toBe(false);
});
test('refuses an unknown mapped step through the production checker', () => {
  const candidate = fixture();
  Object.assign(candidate.types.default, { qa: { class: 'api' } });
  expect(() => checkWorkflowBinding(decodeWorkflowBinding(candidate), steps)).toThrow(
    'unknown_step',
  );
});
test('does not fill an incomplete explicit type from default', () => {
  const candidate = fixture();
  Object.assign(candidate.types, { change: { api: { class: 'api' } } });
  expect(() => checkWorkflowBinding(decodeWorkflowBinding(candidate), steps)).toThrow(
    'missing_step',
  );
});
test('refuses the original sample dangling class', () => {
  const candidate = fixture();
  candidate.types.default.api.class = 'review';
  expect(() => checkWorkflowBinding(decodeWorkflowBinding(candidate), steps)).toThrow(
    'unknown_class',
  );
});
test('detaches without freezing caller-owned input', () => {
  const candidate = fixture();
  const suppliedSteps = [...steps];
  const checked = checkWorkflowBinding(decodeWorkflowBinding(candidate), suppliedSteps);
  expect(Object.isFrozen(candidate)).toBe(false);
  expect(Reflect.set(candidate.classes.api, 'model', 'openai:changed-model')).toBe(true);
  expect(candidate.classes.api.model).toBe('openai:changed-model');
  expect(Reflect.set(candidate.classes.api.tools, '0', 'new-tool')).toBe(true);
  suppliedSteps.push('qa');
  expect(suppliedSteps).toContain('qa');
  expect(checked.projectSteps).not.toContain('qa');
  expect(checked.binding.classes.api).toMatchObject({
    model: 'openrouter:openai/gpt-6-sol',
    tools: [],
  });
  expect(Reflect.set(checked.binding.classes.api, 'model', 'openai:changed-model')).toBe(false);
});
```

- [x] **Step 2: Extend the red matrix before implementation.** Use fresh `fixture()` values with `Object.assign`/`Reflect.deleteProperty`: version 2 → `unsupported_version`; executor `other` → `unknown_executor`; missing executor/extra nested key/zero or unsafe limit → `invalid_binding`; bare model → `unpinned_model`; unknown provider → `unknown_provider`; duplicate tools → `invalid_binding`; absolute/drive/dot/NUL prompt path → `invalid_prompt_path`; reserved dictionary key → `invalid_binding`; duplicate/empty project codes → `invalid_project_steps`; no default + unknown type → `unmapped_type`; selecting an unchecked step → `unknown_step`. Include unused invalid class, all five valid classes, exact explicit-type override, and output detachment/freeze. Assert `WorkflowBindingError.code` and `.path` in one direct error-capture case; do not rely only on message text.
- [x] **Step 3: Run red.** `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000`. Before code exists expect missing module/export; after scaffolding expect the intended behavior assertions to fail. Record both phases honestly; a missing export is not a proof that a guard works.
- [x] **Step 4: Implement only the Task 1 interfaces.** Declare each strict ArkType branch, with field-specific refusal classification at the boundary; validate plain JSON shapes rather than allowing class instances. Detach accepted decoded values, recursively freeze only binding-owned plain objects/arrays, copy/sort project steps, and select own entries using `Object.hasOwn`.

```ts
// Intended selection sequence, after validated type/step arguments:
const matchedType = Object.hasOwn(checked.binding.types, typeCode) ? typeCode : 'default';
// Missing own matchedType -> unmapped_type; step outside projectSteps -> unknown_step.
// Read checked mapping/class after these checks; unexpected absence throws, never defaults.
```

- [x] **Step 5: Run green, then prove guards.** Rerun the red command; then remove each distinct production guard in turn (version, discriminant, strict fields, model prefix/provider, limits, duplicate tools, path/keys, step-set/reference/coverage, selection, detachment/freeze). Rerun its exact named test with `-t '<test name>'`; observe failure, restore, rerun green. Bypass unknown-step rejection alone and require the `qa` test to fail because checking succeeds. For detachment, require successful mutation of the caller-owned document and arrays while checked values stay unchanged. Replacing cloning with freezing caller aliases must fail because caller mutation no longer succeeds. Separately bypass returned-value freezing and require `Reflect.set` on nested returned settings to succeed, failing its expected refusal. These are distinct faults; do not mask a frozen input by catching its mutation error. Add adjacent `Proof:` comments only for observations actually obtained.
- [x] **Step 6: Review checkpoint.** Run `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache` and `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache`. Record scope, output and mutation evidence in parent `verify.md`; ask root for the slice review through the established dispatch flow. No acceptance claim or parent task completion yet.

### Task 2: Exact prompt bytes, immutable acceptance digest and real loader

**Files:**

- Modify: `apps/twilight-structure/twilight-burokrat/cli/src/contracts/validate-workflow-binding.ts`
- Modify: `apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.ts`
- Modify: `./apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.test.ts`
- Modify: `apps/twilight-structure/twilight-burokrat/cli/src/contracts/canonical.ts`
- Modify: `./apps/twilight-structure/twilight-burokrat/cli/src/contracts/canonical.test.ts`
- Create: `apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.ts`
- Create: `./apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.test.ts`
- Create: `apps/twilight-structure/twilight-burokrat/cli/src/contracts/fixtures/workflow-binding.v1.yaml` (the complete illustrative parent sample from parent `design.md` Workflow binding example)

**Interfaces:**

- Consumes Task 1's `decodeWorkflowBinding`, `checkWorkflowBinding`, `selectActivityClass`, `CheckedBinding`, named error and frozen class types; consumes existing `digestOf(value: unknown): string`.
- Produces `digestBytes(bytes: Uint8Array): string` in `contracts/canonical.ts` (SHA-256 of exact bytes, lowercase hex).
- Produces `PromptSource`, `PromptSnapshot`, `AcceptanceSnapshot`, `ValidatedBinding`, `SelectedActivity` exactly as companion design defines.
- Produces `acceptWorkflowBinding(checked: CheckedBinding, prompts: readonly PromptSource[]): ValidatedBinding`; `selectWorkflowActivity(accepted: ValidatedBinding, typeCode: string, stepCode: string): SelectedActivity`.
- Produces `readWorkflowBinding(repositoryRoot: string, file: string, projectSteps: readonly string[]): ValidatedBinding` from `src/workflow-binding.ts`. It performs real filesystem IO; there is no production test hook or fake reader API. Task 1's exports stay truthful and unchanged.

- [x] **Step 1: Write pure snapshot red tests.** Use a minimal one-human-class binding to isolate byte behavior; include a BOM test separately.

```ts
import { createHash } from 'node:crypto';
import { digestOf } from './canonical';
import { decodeWorkflowBinding } from './workflow-binding';
import {
  acceptWorkflowBinding,
  checkWorkflowBinding,
  selectWorkflowActivity,
} from './validate-workflow-binding';

const source = {
  version: 1,
  types: { default: { approve: { class: 'decision' } } },
  classes: { decision: { executor: 'human', prompt: '.twilight/approve.md' } },
};
test('acceptance survives caller mutation and binds changed prompt bytes', () => {
  const bytes = new TextEncoder().encode('Approve this revision.\n');
  const expectedBytes = Buffer.from(bytes);
  const checked = checkWorkflowBinding(decodeWorkflowBinding(source), ['approve']);
  const accepted = acceptWorkflowBinding(checked, [{ path: '.twilight/approve.md', bytes }]);
  const digest = accepted.bindingDigest;
  const expectedSha256 = createHash('sha256').update(expectedBytes).digest('hex');
  expect(Buffer.from(accepted.prompts[0].bytesBase64, 'base64')).toEqual(expectedBytes);
  expect(accepted.prompts[0].sha256).toBe(expectedSha256);
  expect(accepted.snapshot.prompts).toEqual([
    { path: '.twilight/approve.md', sha256: expectedSha256 },
  ]);
  bytes[0] = 88;
  expect(accepted.bindingDigest).toBe(digestOf(accepted.snapshot));
  expect(accepted.prompts[0].text).toBe('Approve this revision.\n');
  expect(Reflect.set(accepted.snapshot.binding.classes.decision, 'prompt', 'changed.md')).toBe(
    false,
  );
  expect(Reflect.set(accepted.prompts[0], 'text', 'changed')).toBe(false);
  expect(accepted.bindingDigest).toBe(digest);
  expect(
    acceptWorkflowBinding(checked, [{ path: '.twilight/approve.md', bytes }]).bindingDigest,
  ).not.toBe(digest);
  expect(selectWorkflowActivity(accepted, 'change', 'approve').prompt?.text).toBe(
    'Approve this revision.\n',
  );
});
test('binds original BOM bytes while decoding prompt text', () => {
  const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, 0x41, 0x0a]);
  const checked = checkWorkflowBinding(decodeWorkflowBinding(source), ['approve']);
  const accepted = acceptWorkflowBinding(checked, [{ path: '.twilight/approve.md', bytes }]);
  const expectedSha256 = createHash('sha256').update(bytes).digest('hex');
  expect(accepted.prompts[0].text).toBe('A\n');
  expect(Buffer.from(accepted.prompts[0].bytesBase64, 'base64')).toEqual(Buffer.from(bytes));
  expect(accepted.prompts[0].sha256).toBe(expectedSha256);
  expect(accepted.snapshot.prompts[0].sha256).toBe(expectedSha256);
  expect(accepted.bindingDigest).toBe(digestOf(accepted.snapshot));
});
```

Add tests for missing/duplicate/extra sources (`invalid_prompt_sources`), malformed bytes (`invalid_prompt_encoding`), exact base64 roundtrip/BOM preservation, no prompt for tool, empty valid text, sorted-set stability, all declared prompt references, object-key-order stability, significant tool order, and byte digest known vector (`digestBytes(new Uint8Array())` equals standard empty SHA-256).

- [x] **Step 2: Write real loader red tests.** This setup writes a JSON document, which is valid YAML, without depending on a YAML stringifier. Use `beforeEach/afterEach` and restore modes in `finally`.

```ts
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { readWorkflowBinding } from './workflow-binding';
let root: string;
let prompt: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'binding-'));
  mkdirSync(join(root, '.twilight'));
  prompt = join(root, '.twilight', 'approve.md');
  writeFileSync(prompt, 'Approve this revision.\n');
  writeFileSync(
    join(root, '.twilight', 'workflows.yaml'),
    JSON.stringify({
      version: 1,
      types: { default: { approve: { class: 'decision' } } },
      classes: { decision: { executor: 'human', prompt: '.twilight/approve.md' } },
    }),
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
test('refuses a nonregular binding before reading its bytes', () => {
  const binding = join(root, '.twilight', 'workflows.yaml');
  rmSync(binding);
  mkdirSync(binding);
  expect(() => readWorkflowBinding(root, '.twilight/workflows.yaml', ['approve'])).toThrow(
    'invalid_yaml',
  );
  expect(() => readWorkflowBinding(root, '.twilight/workflows.yaml', ['approve'])).toThrow(
    'regular file',
  );
});
test('anchors prompt to root, not binding directory', () => {
  const accepted = readWorkflowBinding(root, '.twilight/workflows.yaml', ['approve']);
  expect(accepted.prompts[0].text).toBe('Approve this revision.\n');
});
test('names absent prompt separately from unreadable prompt', () => {
  rmSync(prompt);
  expect(() => readWorkflowBinding(root, '.twilight/workflows.yaml', ['approve'])).toThrow(
    'prompt_missing',
  );
});
test('names unreadable prompt at the real filesystem boundary', () => {
  if (process.getuid?.() === 0) throw new Error('file-mode proof requires non-root');
  chmodSync(prompt, 0);
  try {
    expect(() => readFileSync(prompt)).toThrow();
    expect(() => readWorkflowBinding(root, '.twilight/workflows.yaml', ['approve'])).toThrow(
      'prompt_unreadable',
    );
  } finally {
    chmodSync(prompt, 0o600);
  }
});
```

Also copy the complete YAML from parent `design.md` Workflow binding example into the named test fixture, copy it to a temporary root, create its four prompt files under `.twilight/prompts/`, and validate the exact five supplied project codes; assert selected review is api-model and integrate is human. The sample is test input only, never a repository default. Also distinguish binding missing/unreadable/nonregular, unusable root, prompt directory, internal/external symlink, malformed binding UTF-8, duplicate/non-string YAML keys, alias/merge/custom tag, explicit YAML 1.1 directive, warning/extra document and invalid scalar shapes. Compare ordinary YAML with reordered/commented equivalent input; editing the prompt must change digest without editing YAML. The permission proof intentionally requires the same non-root environment as existing Burokrat file-mode tests; do not skip or claim chmod succeeds under root.

- [x] **Step 3: Run red.** `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000`.
- [x] **Step 4: Implement acceptance and loader only.** Hash original bytes with the existing crypto primitive, retain base64, decode with fatal UTF-8, build sorted descriptors and deeply freeze the accepted snapshot. Use `digestOf(snapshot)`, not a hash of the decoded text or just YAML. Existing `canonicalJson` defines object ordering; do not import the evidence canonicalizer.

```ts
// A local staging copy keeps the three derivations visibly tied to one input.
// This copy is an implementation choice, not an independently claimed safety guard.
const original = Uint8Array.from(source.bytes);
const sha256 = digestBytes(original);
const text = new TextDecoder('utf-8', { fatal: true }).decode(original);
const bytesBase64 = Buffer.from(original).toString('base64');
// Store frozen { path: source.path, sha256, text, bytesBase64 }.
```

Use installed `yaml:parseAllDocuments` with explicit strict YAML 1.2 and unique-key checking, inspect errors/warnings, effective YAML version and AST aliases/tags/merge keys/non-string keys, then assign `document.toJS()` to `unknown` and call the decoder. Only guarded single-document access is allowed. Do not use `stringKeys: true` (it coerces numeric keys). Use contextual named filesystem throws. Call `statSync` on the resolved binding filename and require `.isFile()` before any byte read; refuse nonregular binding input as `invalid_yaml` with detail `binding must be a regular file`. This prevents opening a preexisting FIFO/device for reading. For prompts, validate physical containment and regular-file status before the single byte read. Add no command execution or stdout in the loader.

- [x] **Step 5: Run green and production negatives.** Repeat the red command plus `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/canonical.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000`. Mutate the production source-set check, fatal decoder, snapshot digest prompt descriptors, returned-value freeze, root anchor, containment check, binding/prompt regular-file checks, YAML guards, and ENOENT-versus-unreadable mapping separately; corresponding tests must fail, then pass after restore. For the binding stat guard, remove it and require the directory test to fail the specific `regular file` diagnostic (a later EISDIR/read or YAML error is not the same boundary). Break real dependencies by deleting/chmodding prompt and binding; no fake pre-call throw. Original-byte correspondence is the invariant: descriptor SHA, base64-decoded bytes, text, and outer digest must describe the same original input. Use BOM/newline fixtures and production faults such as hashing re-encoded decoded text or retaining re-encoded text as base64; the correspondence tests must fail, then pass on restore. Removing `Uint8Array.from` alone may correctly leave these synchronous tests green because only strings escape; do not claim that mutation as an R5 proof, introduce fake dependency output, or add a production seam merely to force it. Caller-after-return mutation tests prove escaped-value independence, not the necessity of copying. Record only observed faults adjacent to checks and in `verify.md`.
- [x] **Step 6: Review checkpoint.** Run `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache` and `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache`. Reviewer must see a real accepted value returned by the loader, stable after input/output mutation attempts, and no CLI/adapter/authority claim. Parent tasks remain unchecked until Task 3 acceptance.

### Task 3: CLI dispatch, named refusals and command documentation

**Files:**

- Modify: `apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.ts` (add only the declared `invalid_arguments` error code)
- Modify: `apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.ts`
- Modify: `./apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.test.ts`
- Modify: `apps/twilight-structure/twilight-burokrat/cli/src/cli.ts`
- Modify: `apps/twilight-structure/twilight-burokrat/cli/README.md`
- Update evidence: `openspec/changes/twilight-agentic-workflows/verify.md`

**Interfaces:**

- Consumes `readWorkflowBinding(repositoryRoot: string, file: string, projectSteps: readonly string[]): ValidatedBinding` and `WorkflowBindingError` from Task 2; existing `executeCli(argv: readonly string[]): Promise<void>` error boundary and test-only `invokeCli(argv, environment?)` remain unchanged.
- Produces `runWorkflowBindingCommand(args: readonly string[], repositoryRoot: string): string`, where `args` is the entire five-element command after executable removal. It validates exact grammar first and returns `readWorkflowBinding(...).bindingDigest`; it never writes stdout itself.
- Changes `runCli` routing: identify the `validate workflow-binding` prefix before generic three-argument record validation, then print returned digest plus newline. No new RecordKind, generic validate alias, CLI process globals in pure contracts or authority status.

- [x] **Step 1: Write CLI red tests.** Add to loader test file, reusing its real temporary-root fixture. The actual process tests exercise cwd; no process-global chdir is needed.

```ts
import { invokeCli } from './invoke-cli';

test('routes an incomplete binding command before generic record validation', async () => {
  const invocation = await invokeCli(['validate', 'workflow-binding', '/never-read.yaml']);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('invalid_arguments');
  expect(invocation.stderr).not.toContain('binding_missing');
});
test('prints only the accepted digest with real cwd and exit status', () => {
  const accepted = readWorkflowBinding(root, '.twilight/workflows.yaml', ['approve']);
  const child = Bun.spawnSync({
    cmd: [
      process.execPath,
      join(import.meta.dir, 'cli.ts'),
      'validate',
      'workflow-binding',
      '.twilight/workflows.yaml',
      '--steps',
      'approve',
    ],
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString()).toBe(`${accepted.bindingDigest}\n`);
  expect(child.stderr.toString()).toBe('');
});
```

Add invalid empty/extra/repeated flags, empty/duplicate step segments, unknown step, missing prompt and malformed YAML cases; all refuse with named stderr and empty success stdout. Spawn one `qa` case and one cwd mismatch case. Exercise a preexisting valid JSON record through both `validate` and `validate-record` to prove legacy dispatch remains; `validate-record workflow-binding ...` remains unsupported.

- [x] **Step 2: Run red.** `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000`. Expect current generic RecordKind/unknown-command output to fail the new routing assertions before implementing dispatch.
- [x] **Step 3: Add grammar and dispatch, then documentation.** Implement the named helper with exact five-argument parsing and no file reads before successful grammar validation. Use this branch before generic record routing:

```ts
if (args[0] === 'validate' && args[1] === 'workflow-binding') {
  const digest = runWorkflowBindingCommand(args, process.cwd());
  process.stdout.write(`${digest}\n`);
  return;
}
```

Document the accepted command, cwd-root anchor, whole-type fallback, digest covering original prompt bytes, required prompt files, and no authority/backend-availability guarantee. Link the contract design; do not copy its full schema into README. The parent design already contains the complete illustrative sample; leave repository `.twilight` and gate scripts untouched.

- [x] **Step 4: Run green and production-path CLI proofs.** Bypass the production step membership guard and require the spawned `qa` command to exit 0, causing its refusal test to fail; restore and rerun. Move/remove early dispatch and require incomplete-command named-code test to fail. Bypass exact-arity validation and require malformed flags/operand test to fail. Record actual mutations, assertions and restoration in `verify.md` and adjacent `Proof:` comments. Do not treat testing a fake command as a proof.
- [x] **Step 5: Run the bounded final packet checks.** Run the following from repository root; package-wide/full exact-SHA gate remains the root integration workflow, especially on h2puni.

```sh
bun test ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/canonical.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/no-ambient-clock.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
bunx prettier --check apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.ts apps/twilight-structure/twilight-burokrat/cli/src/contracts/validate-workflow-binding.ts ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.test.ts apps/twilight-structure/twilight-burokrat/cli/src/contracts/canonical.ts ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/canonical.test.ts apps/twilight-structure/twilight-burokrat/cli/src/contracts/index.ts apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.ts ./apps/twilight-structure/twilight-burokrat/cli/src/workflow-binding.test.ts apps/twilight-structure/twilight-burokrat/cli/src/cli.ts apps/twilight-structure/twilight-burokrat/cli/README.md
./node_modules/.bin/openspec validate twilight-agentic-workflows --json
```

The installed OpenSpec validator reported eight long-requirement warnings when root adopted this supplement (seven before the added acceptance requirement); `--strict` would not be an expected-green command. Use `--json`, record its actual exit status and warning list, and investigate new errors/warnings without blanket rewriting existing requirements. Adoption validation passed with zero errors; preserve the actual warning count in later evidence.

`project.json` defines `twilight-burokrat:typecheck` and `lint:source` exactly; its full `test` target includes trusted-module setup, install-test exclusions and scratch preload, so do not substitute a guessed Nx test filter. Publishing is out of scope; root chooses package/build integration checks under the repository gate. Root must still perform required repository/integration gates before claiming merged completion.

- [x] **Step 6: Review checkpoint and scoped evidence.** Present observed commands, named refusal coverage and production-negative evidence to root. Parent 1.1–1.2 may be checked only after review; I1 as a whole, parent 1.3 and 6a.3 remain open. No live API, recovery, spending or governance approval claim follows from these tests.
