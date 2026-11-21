import { expect, test } from 'bun:test';

import { digestOf } from './canonical';
import { WorkflowBindingError } from './workflow-binding';
import * as workflow from './workflow-manifest';

function accept() {
  const manifest = workflow.decodeStepManifest({
    version: 1,
    project: { id: 'engagement', revision: 7 },
    default: ['build'],
    types: [
      { workItemTypeId: 'story', codes: ['build'] },
      { workItemTypeId: 'spike', codes: ['build', 'research'] },
    ],
  });
  const binding = workflow.decodeManifestBinding({
    version: 2,
    project: { id: 'engagement', revision: 7 },
    default: [{ code: 'build', class: 'verify' }],
    types: [
      {
        workItemTypeId: 'spike',
        steps: [
          { code: 'build', class: 'verify' },
          { code: 'research', class: 'verify' },
        ],
      },
    ],
    classes: {
      verify: { executor: 'tool', command: 'verify' },
      decision: { executor: 'human', prompt: 'approve.md' },
      unused: { executor: 'human', prompt: 'unused.md' },
    },
  });
  return workflow.acceptManifestBinding(workflow.checkManifestBinding(binding, manifest), [
    { path: 'approve.md', bytes: Buffer.from('\ufeffApprove\n') },
    { path: 'unused.md', bytes: Buffer.from('Unused\n') },
  ]);
}
const snapshot = () => structuredClone(accept().snapshot);
function decode(input: unknown): unknown {
  const reader = workflow.decodeManifestWorkflowAcceptance;
  expect(typeof reader).toBe('function');
  if (typeof reader !== 'function') throw Error('schema2 acceptance reader is absent');
  return reader(input);
}
function expectRefusal(input: unknown, code: WorkflowBindingError['code'], path?: string) {
  let refusal: unknown;
  try {
    decode(input);
  } catch (cause: unknown) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(WorkflowBindingError);
  if (!(refusal instanceof WorkflowBindingError)) throw Error('expected schema2 refusal');
  expect(refusal.code).toBe(code);
  if (path !== undefined) expect(refusal.path).toBe(path);
}
test('manifest acceptance reader reconstructs original BOM descriptors and canonical digest', () => {
  const accepted = accept();
  expect(decode(snapshot())).toEqual(accepted.snapshot);
  expect(digestOf(decode(snapshot()))).toBe(accepted.bindingDigest);
  expect(accepted.snapshot.manifestDigest).toBe(digestOf(accepted.snapshot.manifest));
});
test('manifest acceptance reader refuses a syntactically valid wrong manifest digest', () => {
  expect(decode(snapshot())).toEqual(accept().snapshot);
  const supplied = snapshot();
  Reflect.set(supplied, 'manifestDigest', '0'.repeat(64));
  expectRefusal(supplied, 'invalid_manifest', 'manifestDigest');
});
test('manifest acceptance reader refuses coherently retargeted revision with an old manifest digest', () => {
  expect(decode(snapshot())).toEqual(accept().snapshot);
  const supplied = snapshot();
  Reflect.set(supplied.binding.project, 'revision', 8);
  Reflect.set(supplied.manifest.project, 'revision', 8);
  expectRefusal(supplied, 'invalid_manifest', 'manifestDigest');
});
test('manifest acceptance reader rechecks retained per-type coverage', () => {
  expect(decode(snapshot())).toEqual(accept().snapshot);
  const supplied = snapshot();
  Reflect.set(supplied.binding, 'types', [
    ...supplied.binding.types,
    {
      workItemTypeId: 'story',
      steps: [
        { code: 'build', class: 'verify' },
        { code: 'research', class: 'verify' },
      ],
    },
  ]);
  expectRefusal(supplied, 'unknown_step', 'types.story.research');
});
test('manifest acceptance reader preserves project revision refusal', () => {
  expect(decode(snapshot())).toEqual(accept().snapshot);
  const supplied = snapshot();
  Reflect.set(supplied.manifest.project, 'revision', 8);
  expectRefusal(supplied, 'manifest_mismatch', 'project.revision');
});
for (const fault of ['missing', 'duplicate', 'unsorted', 'extra'] as const) {
  test('manifest acceptance reader refuses descriptor coverage ' + fault, () => {
    expect(decode(snapshot())).toEqual(accept().snapshot);
    const supplied = snapshot();
    const prompts =
      fault === 'missing'
        ? supplied.prompts.slice(0, 1)
        : fault === 'duplicate'
          ? [supplied.prompts[0], supplied.prompts[0]]
          : fault === 'unsorted'
            ? [...supplied.prompts].reverse()
            : [...supplied.prompts, { path: 'extra.md', sha256: '0'.repeat(64) }];
    Reflect.set(supplied, 'prompts', prompts);
    expectRefusal(supplied, 'invalid_prompt_sources', 'prompts');
  });
}
for (const fault of [
  'extra-envelope',
  'extra-descriptor',
  'uppercase-sha',
  'missing-version',
  'invalid-unused-class',
] as const) {
  test('manifest acceptance reader refuses strict shape ' + fault, () => {
    expect(decode(snapshot())).toEqual(accept().snapshot);
    const supplied = snapshot();
    if (fault === 'extra-envelope') Reflect.set(supplied, 'extra', true);
    if (fault === 'extra-descriptor') Reflect.set(supplied.prompts[0], 'extra', true);
    if (fault === 'uppercase-sha') Reflect.set(supplied.prompts[0], 'sha256', 'A'.repeat(64));
    if (fault === 'missing-version') Reflect.deleteProperty(supplied, 'schemaVersion');
    if (fault === 'invalid-unused-class')
      Reflect.set(supplied.binding.classes['unused'], 'executor', 'unknown');
    expectRefusal(
      supplied,
      fault === 'invalid-unused-class' ? 'unknown_executor' : 'invalid_binding',
    );
  });
}
test('manifest acceptance reader refuses another retained schema version', () => {
  expect(decode(snapshot())).toEqual(accept().snapshot);
  const supplied = snapshot();
  Reflect.set(supplied, 'schemaVersion', 3);
  expectRefusal(supplied, 'unsupported_version', 'schemaVersion');
});
test('manifest acceptance reader refuses accessors without reading them', () => {
  expect(decode(snapshot())).toEqual(accept().snapshot);
  const supplied = snapshot();
  let observed = false;
  Object.defineProperty(supplied, 'manifest', {
    enumerable: true,
    get() {
      observed = true;
      return {};
    },
  });
  expectRefusal(supplied, 'invalid_binding');
  expect(observed).toBe(false);
});
test('manifest acceptance reader detaches and deeply freezes without freezing the supplied snapshot', () => {
  const supplied = snapshot();
  const decoded = decode(supplied);
  expect(decoded).toEqual(supplied);
  expect(Object.isFrozen(decoded)).toBe(true);
  expect(Object.isFrozen(supplied)).toBe(false);
  expect(Reflect.set(supplied.manifest.project, 'revision', 8)).toBe(true);
  expect(decoded).toEqual(accept().snapshot);
  if (typeof decoded !== 'object' || decoded === null)
    throw Error('decoded snapshot is not an object');
  expect(Reflect.set(decoded, 'manifestDigest', 'changed')).toBe(false);
  const manifest: unknown = Reflect.get(decoded, 'manifest');
  expect(Object.isFrozen(manifest)).toBe(true);
});
