import { expect, test } from 'bun:test';

import {
  buildDependencyCapabilityCommand,
  decodeDependencyCapabilities,
} from './dependency-capability';

test('dependency command is argument-free and distinct from migration capability', () => {
  expect(buildDependencyCapabilityCommand()).toEqual([
    'bun',
    'run',
    'src/dependency-capabilities-cli.ts',
  ]);
});
const capability = {
  protocol: 'wbs-dependency-runtime',
  role: 'backend',
  version: 1,
  semantics: ['cross-project-dependencies-v1'],
} as const;
test('closed decoder preserves explicit empty support', () => {
  expect(decodeDependencyCapabilities(JSON.stringify(capability))).toEqual(capability.semantics);
  expect(decodeDependencyCapabilities(JSON.stringify({ ...capability, semantics: [] }))).toEqual(
    [],
  );
});
for (const [fault, wire] of Object.entries({
  missing: '',
  malformed: 'garbage',
  null: 'null',
  array: '[]',
  protocol: JSON.stringify({ ...capability, protocol: 'other' }),
  version: JSON.stringify({ ...capability, version: 2 }),
  role: JSON.stringify({ ...capability, role: 'gateway' }),
  extra: JSON.stringify({ ...capability, extra: 0 }),
  absent: JSON.stringify({ protocol: capability.protocol, version: 1, role: 'backend' }),
  semantic: JSON.stringify({ ...capability, semantics: ['unknown'] }),
  duplicate: JSON.stringify({
    ...capability,
    semantics: [...capability.semantics, ...capability.semantics],
  }),
}))
  test(`closed decoder refuses ${fault}`, () => {
    expect(() => decodeDependencyCapabilities(wire)).toThrow();
  });
