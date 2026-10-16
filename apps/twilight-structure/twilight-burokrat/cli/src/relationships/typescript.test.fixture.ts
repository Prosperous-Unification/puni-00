import { posix } from 'node:path';

import type { TypeScriptLimits, TypeScriptSource } from './typescript-core';

export const workspace = '/candidate';
export const limits: TypeScriptLimits = {
  maximumProbes: 10000,
  maximumReadBytes: 1000000,
  maximumDirectoryEntries: 10000,
  maximumOutputBytes: 1000000,
  maximumObservedOutputBytes: 1000000,
};
export const globals =
  'interface Array<T> {} interface Boolean {} interface Function {} interface CallableFunction {} interface NewableFunction {} interface IArguments {} interface Number {} interface Object {} interface RegExp {} interface String {}';

export function fixture(overrides: Record<string, string> = {}) {
  const files = new Map(
    Object.entries({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { noLib: true, types: [], module: 'esnext' },
        files: ['globals.d.ts', 'src/index.ts'],
      }),
      'globals.d.ts': globals,
      'src/index.ts':
        "import type { Value } from './value'; export const value: Value = { label: 'x' };",
      'src/value.ts': 'export interface Value { label: string }',
      'node_modules/typescript/package.json': '{"name":"typescript","version":"fixture"}',
      ...overrides,
    }).map(([path, text]) => [posix.join(workspace, path), text]),
  );
  const enumerations: string[] = [];
  const source: TypeScriptSource = {
    compilerLibraryDirectory: '/candidate/node_modules/@typescript/old/lib',
    useCaseSensitiveFileNames: true,
    getCurrentDirectory: () => workspace,
    pathKind: (path) =>
      files.has(path)
        ? 'file'
        : [...files.keys()].some((name) => name.startsWith(`${path}/`))
          ? 'directory'
          : 'absent',
    readFile: (path) => files.get(path),
    readDirectory: (path, extensions) => {
      enumerations.push(path);
      return [...files.keys()].filter(
        (name) =>
          name.startsWith(`${path}/`) &&
          (extensions === undefined || extensions.some((extension) => name.endsWith(extension))),
      );
    },
    getDirectories: (path) =>
      [
        ...new Set(
          [...files.keys()]
            .filter((name) => name.startsWith(`${path}/`))
            .map(
              (name): string | undefined =>
                name
                  .slice(path.length + 1)
                  .split('/')
                  .slice(0, -1)[0],
            )
            .filter((name): name is string => name !== undefined),
        ),
      ].map((name) => posix.join(path, name)),
    realpath: (path) => path,
  };
  return { source, enumerations, files };
}

export const request = { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/index.ts'] };
