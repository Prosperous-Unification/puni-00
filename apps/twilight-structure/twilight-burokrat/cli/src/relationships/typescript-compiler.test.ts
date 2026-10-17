import { expect, test } from 'bun:test';

import { fixture, limits, workspace } from './typescript.test.fixture';
import { boundSource, createCompilerHost } from './typescript-compiler';

test('compiler source counts repeated probes at exact boundary', () => {
  const { source } = fixture();
  const system = boundSource(workspace, source, {
    kind: 'bounded',
    limits: { ...limits, maximumProbes: 1 },
  });
  expect(system.pathKind('/candidate/src/index.ts')).toBe('file');
  expect(() => system.pathKind('/candidate/src/index.ts')).toThrow(
    'TypeScript probe limit exceeded',
  );
});

test('compiler source counts repeated UTF8 read bytes at exact boundary', () => {
  const { source, files } = fixture({ 'src/index.ts': 'é' });
  const system = boundSource(workspace, source, {
    kind: 'bounded',
    limits: { ...limits, maximumReadBytes: 4 },
  });
  expect(system.readFile('/candidate/src/index.ts')).toBe('é');
  expect(system.readFile('/candidate/src/index.ts')).toBe('é');
  expect(() => system.readFile('/candidate/src/index.ts')).toThrow(
    'TypeScript read byte limit exceeded',
  );
  files.delete('/candidate/src/index.ts');
});

test('compiler source counts both directory enumeration routes at exact boundary', () => {
  const { source } = fixture();
  source.readDirectory = () => ['/candidate/src/index.ts'];
  source.getDirectories = () => ['/candidate/src'];
  const system = boundSource(workspace, source, {
    kind: 'bounded',
    limits: { ...limits, maximumDirectoryEntries: 2 },
  });
  expect(system.readDirectory('/candidate', [], undefined, [])).toEqual([
    '/candidate/src/index.ts',
  ]);
  expect(system.getDirectories('/candidate')).toEqual(['/candidate/src']);
  expect(() => system.getDirectories('/candidate')).toThrow(
    'TypeScript directory entry limit exceeded',
  );
});

test('compiler observations count UTF8 bytes at exact boundary', () => {
  const { source } = fixture();
  const system = boundSource(workspace, source, {
    kind: 'bounded',
    limits: { ...limits, maximumObservedOutputBytes: 2 },
  });
  system.chargeOutput('é');
  expect(() => {
    system.chargeOutput('x');
  }).toThrow('TypeScript observed output byte limit exceeded');
});

test('compiler namespace misses never delegate outside paths to any source port', () => {
  const { source } = fixture();
  const forbidden = (): never => {
    throw new Error('outside source port invoked');
  };
  source.pathKind = forbidden;
  source.readFile = forbidden;
  source.readDirectory = forbidden;
  source.getDirectories = forbidden;
  source.realpath = forbidden;
  const system = boundSource(workspace, source, { kind: 'bounded', limits });
  expect(system.pathKind('/outside/file.ts')).toBe('absent');
  expect(system.readFile('/outside/file.ts')).toBeUndefined();
  expect(system.readDirectory('/outside', [], undefined, [])).toEqual([]);
  expect(system.getDirectories('/outside')).toEqual([]);
  expect(() => system.realpath('/outside/file.ts')).toThrow(
    'compiler path outside trusted closure',
  );
});

test('compiler ambient output callback refuses unexpected compiler writes', () => {
  const { source } = fixture();
  const system = boundSource(workspace, source, { kind: 'bounded', limits });
  const host = createCompilerHost({}, system);
  expect(() => {
    host.writeFile('/candidate/unexpected.d.ts', 'unexpected output', false);
  }).toThrow('TypeScript compiler attempted an ambient output write');
});

test('compiler source preserves basename directory entries from installed sys contract', () => {
  const { source } = fixture();
  const system = boundSource(workspace, source, { kind: 'bounded', limits });
  expect(system.getDirectories('/candidate')).toEqual(['src', 'node_modules']);
});
