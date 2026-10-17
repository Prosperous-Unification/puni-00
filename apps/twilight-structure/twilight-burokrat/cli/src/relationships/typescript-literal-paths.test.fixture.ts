import { expect, mock, spyOn, test } from 'bun:test';
import ts from 'typescript';

import { fixture, limits, workspace } from './typescript.test.fixture';

const shape = process.env['LITERAL_PATHS_SHAPE'];
const parse = ts.parseJsonConfigFileContent;
const runtime: Record<string, unknown> = { ...ts };
const malformed: Record<string, Record<string, unknown>> = {
  nonobject: { paths: null },
  'array-map': { paths: [] },
  'primitive-map': { paths: 1 },
  'wildcard-only': { paths: { unused: ['/outside/*'] }, pathsBasePath: undefined },
  'empty-map': { paths: {}, pathsBasePath: undefined },
  nonarray: { paths: { unused: './types' } },
  nonstring: { paths: { unused: [null] } },
  'missing-origin': { paths: { unused: ['./types'] }, pathsBasePath: undefined },
  'nonstring-origin': { paths: { unused: ['./types'] }, pathsBasePath: 4 },
  'nonstring-base': { paths: { unused: ['./types'] }, baseUrl: 4 },
};
if (shape === undefined) throw new Error('LITERAL_PATHS_SHAPE required');
const fields = malformed[shape];
runtime['parseJsonConfigFileContent'] = (...args: Parameters<typeof parse>) => {
  const parsed = parse(...args);
  Object.assign(parsed.options, fields);
  return parsed;
};
if (shape === 'helper-absent' || shape === 'wildcard-only' || shape === 'empty-map')
  runtime['resolvePath'] = undefined;
if (shape === 'helper-signature') runtime['resolvePath'] = () => '/candidate/types';
if (shape === 'helper-version') runtime['version'] = 'foreign';
if (shape === 'helper-return')
  runtime['resolvePath'] = (_path: string, ..._paths: string[]) => undefined;
await mock.module('typescript', () => ({ default: runtime }));
const compiler = await import('./typescript-compiler');
test('effective literal paths validates boundary before compiler host', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], paths: { unused: ['./types'] } },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  const system = compiler.boundSource(workspace, source, { kind: 'bounded', limits });
  let didReadHost = false;
  system.getCurrentDirectory = () => {
    didReadHost = true;
    return workspace;
  };
  const createHost = compiler.createCompilerHost;
  let hostCreations = 0;
  const host = spyOn(compiler, 'createCompilerHost').mockImplementation(
    (...args: Parameters<typeof compiler.createCompilerHost>) => {
      hostCreations++;
      return createHost(...args);
    },
  );
  try {
    if (shape === 'wildcard-only' || shape === 'empty-map') {
      expect(
        compiler.parseProject(workspace, 'tsconfig.json', system, 'retained-config-roots')
          .configPath,
      ).toBe('tsconfig.json');
      expect(hostCreations).toBe(1);
      return;
    }
    expect(() =>
      compiler.parseProject(workspace, 'tsconfig.json', system, 'retained-config-roots'),
    ).toThrow(/TypeScript.*paths|TypeScript.*base|TypeScript.*resolvePath/);
    expect(hostCreations).toBe(0);
    expect(didReadHost).toBe(false);
  } finally {
    host.mockRestore();
  }
});
