import { expect, test } from 'bun:test';
import ts from 'typescript';

import { fixture, limits, request, workspace } from './typescript.test.fixture';
import { extractTypeScriptRelationshipsFromSource } from './typescript-core';
import { extractSerialRelationships } from './typescript-serial';

test('selected runtime preserves complete bounded and serial relationships', () => {
  const selected = { ...ts, version: 'selected-runtime' };
  const bounded = extractTypeScriptRelationshipsFromSource(
    workspace,
    request,
    fixture().source,
    limits,
    selected,
  );
  expect(bounded.extractor.version).toBe('vselected-runtime');
  expect(
    bounded.relationships.imports.map(({ source, target, importKind }) => ({
      source,
      target,
      importKind,
    })),
  ).toEqual([{ source: 'src/index.ts', target: 'src/value.ts', importKind: 'type' }]);
  expect(
    bounded.relationships.publicDeclarations[0]?.declarations.map(({ sourcePath }) => sourcePath),
  ).toEqual(['src/index.ts', 'src/value.ts']);
  expect(extractSerialRelationships(workspace, request, fixture().source, selected)).toEqual(
    bounded,
  );
});

for (const operation of [
  'readConfigFile',
  'parseJsonConfigFileContent',
  'createProgram',
  'resolveModuleName',
  'isImportDeclaration',
  'forEachChild',
  'isIdentifier',
] as const) {
  test(`selected runtime ${operation} failure reaches source extraction`, () => {
    const sentinel = `selected runtime ${operation}`;
    const selected = {
      ...ts,
      [operation]: () => {
        throw new Error(sentinel);
      },
    };
    expect(() =>
      extractTypeScriptRelationshipsFromSource(
        workspace,
        request,
        fixture().source,
        limits,
        selected,
      ),
    ).toThrow(sentinel);
  });
}

test('selected diagnostic failure propagates with selected diagnostic formatting', () => {
  const selected = {
    ...ts,
    getPreEmitDiagnostics: (): readonly ts.Diagnostic[] => [
      {
        category: ts.DiagnosticCategory.Error,
        code: 1234,
        file: undefined,
        start: undefined,
        length: undefined,
        messageText: 'selected error',
      },
    ],
    flattenDiagnosticMessageText: () => 'selected formatted diagnostic',
  };
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      request,
      fixture().source,
      limits,
      selected,
    ),
  ).toThrow('selected formatted diagnostic');
  expect(() => extractSerialRelationships(workspace, request, fixture().source, selected)).toThrow(
    'selected formatted diagnostic',
  );
});

test('selected declaration parser failure propagates after source compilation', () => {
  const selected = {
    ...ts,
    createSourceFile: (...args: Parameters<typeof ts.createSourceFile>) => {
      if (args[0].endsWith('.d.ts') && args[0] !== '/candidate/globals.d.ts')
        throw new Error('selected declaration parser');
      return ts.createSourceFile(...args);
    },
  };
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      request,
      fixture().source,
      limits,
      selected,
    ),
  ).toThrow('selected declaration parser');
});

for (const phase of [2, 3, 4, 5]) {
  test(`serial selected runtime reaches program reconstruction phase ${String(phase)}`, () => {
    let programs = 0;
    const selected = {
      ...ts,
      createProgram: new Proxy(ts.createProgram, {
        apply(target, receiver, args) {
          programs++;
          if (programs === phase) throw new Error(`selected reconstruction ${String(phase)}`);
          return Reflect.apply(target, receiver, args) as ts.Program;
        },
      }),
    };
    expect(() =>
      extractSerialRelationships(workspace, request, fixture().source, selected),
    ).toThrow(`selected reconstruction ${String(phase)}`);
  });
}

test('selected runtime owns serial project reference paths', () => {
  const selected = {
    ...ts,
    resolveProjectReferencePath: () => {
      throw new Error('selected reference path');
    },
  };
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [] },
      files: ['globals.d.ts', 'src/index.ts'],
      references: [{ path: './referenced' }],
    }),
    'referenced/tsconfig.json': JSON.stringify({
      compilerOptions: { composite: true, noLib: true, types: [] },
      files: ['value.ts'],
    }),
    'referenced/value.ts': 'export interface Referenced {}',
  });
  expect(() => extractSerialRelationships(workspace, request, source, selected)).toThrow(
    'selected reference path',
  );
});

test('selected runtime owns literal path normalization', () => {
  const selected = { ...ts };
  Object.defineProperty(selected, 'resolvePath', {
    enumerable: false,
    value: (_path: string, ..._paths: string[]) => {
      throw new Error('selected literal path');
    },
  });
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], paths: { unused: ['./types'] } },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      request,
      source,
      limits,
      selected,
      'retained-config-roots',
    ),
  ).toThrow('selected literal path');
});

test('selected syntax constants determine import kind', () => {
  const selected = {
    ...ts,
    SyntaxKind: { ...ts.SyntaxKind, TypeKeyword: -1 as ts.SyntaxKind.TypeKeyword },
  };
  const extraction = extractTypeScriptRelationshipsFromSource(
    workspace,
    request,
    fixture().source,
    limits,
    selected,
  );
  expect(extraction.relationships.imports.map(({ importKind }) => importKind)).toEqual(['value']);
});

test('selected source parser failure cannot be deferred to declaration parsing', () => {
  const selected = {
    ...ts,
    createSourceFile: (...args: Parameters<typeof ts.createSourceFile>) => {
      if (!args[0].endsWith('.d.ts')) throw new Error('selected source parser');
      return ts.createSourceFile(...args);
    },
  };
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      request,
      fixture().source,
      limits,
      selected,
    ),
  ).toThrow('selected source parser');
});

test('selected runtime determines default library construction', () => {
  const selected = {
    ...ts,
    getDefaultLibFileName: () => {
      throw new Error('selected default library');
    },
  };
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { target: 'es5', types: [] },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits, selected),
  ).toThrow('selected default library');
});
