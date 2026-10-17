import { expect, test } from 'bun:test';
import ts from 'typescript';

import { fixture, limits, workspace } from './typescript.test.fixture';
import { boundSource, createCompilerHost, parseProject } from './typescript-compiler';

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

test('explicit type root admission delegates outside paths and charges repeated probes', () => {
  const { source } = fixture();
  const paths: string[] = [];
  source.pathKind = (path) => {
    paths.push(path);
    return 'absent';
  };
  const system = boundSource(workspace, source, {
    kind: 'bounded',
    limits: { ...limits, maximumProbes: 2 },
  });
  system.admitConfigurationRoot('/outside/types');
  system.admitConfigurationRoot('/outside/types');
  expect(paths).toEqual(['/outside/types', '/outside/types']);
  expect(() => {
    system.admitConfigurationRoot('/outside/types');
  }).toThrow('TypeScript probe limit exceeded');
  expect(paths).toHaveLength(2);
});

test('retained admission observes only parser effective roots at the declaring config base', () => {
  for (const [options, inherited, expected] of [
    [{}, ['./types'], ['/candidate/configs/types']],
    [{ typeRoots: ['./types'] }, ['../../outside'], ['/candidate/types']],
    [{ typeRoots: ['./types', 'types'] }, undefined, ['/candidate/types', '/candidate/types']],
  ] as const) {
    const { source } = fixture({
      'tsconfig.json': JSON.stringify({
        extends: './configs/base.json',
        compilerOptions: options,
        files: ['globals.d.ts', 'src/index.ts'],
      }),
      'configs/base.json': JSON.stringify({
        compilerOptions: {
          noLib: true,
          types: [],
          ...(inherited === undefined ? {} : { typeRoots: inherited }),
        },
      }),
    });
    const system = boundSource(workspace, source, { kind: 'bounded', limits });
    const roots: string[] = [];
    system.admitConfigurationRoot = (path) => {
      roots.push(path);
    };
    parseProject(workspace, 'tsconfig.json', system, 'retained-type-roots');
    expect(roots).toEqual([...expected]);
  }
});

test('retained configuration admission preserves normalized typeRoots then rootDirs without deduplication', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      extends: './configs/base.json',
      compilerOptions: { typeRoots: ['types', './types'] },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
    'configs/base.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], rootDirs: ['types', '../generated', 'types'] },
    }),
  });
  const system = boundSource(workspace, source, { kind: 'bounded', limits });
  const roots: string[] = [];
  system.admitConfigurationRoot = (path) => {
    roots.push(path);
  };
  parseProject(workspace, 'tsconfig.json', system, 'retained-config-roots');
  expect(roots).toEqual([
    '/candidate/types',
    '/candidate/types',
    '/candidate/configs/types',
    '/candidate/generated',
    '/candidate/configs/types',
  ]);
});

test('previous retained type roots mode preserves rootDirs as ordinary namespace probes', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], rootDirs: ['/outside/generated'] },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  const system = boundSource(workspace, source, { kind: 'bounded', limits });
  system.admitConfigurationRoot = () => {
    throw new Error('unexpected explicit admission');
  };
  for (const mode of ['compatible', 'retained-type-roots'] as const) {
    expect(parseProject(workspace, 'tsconfig.json', system, mode).configPath).toBe('tsconfig.json');
  }
});

for (const [options, inherited, expected] of [
  [{}, './types', ['/candidate/configs/types']],
  [{ baseUrl: './types' }, '../../outside', ['/candidate/types']],
  [{ baseUrl: '' }, undefined, ['/candidate']],
  [{}, undefined, []],
] as const)
  test(`retained baseUrl admission preserves effective normalization ${JSON.stringify(options)} ${String(inherited)}`, () => {
    const { source } = fixture({
      'tsconfig.json': JSON.stringify({
        extends: './configs/base.json',
        compilerOptions: options,
        files: ['globals.d.ts', 'src/index.ts'],
      }),
      'configs/base.json': JSON.stringify({
        compilerOptions: {
          noLib: true,
          types: [],
          ...(inherited === undefined ? {} : { baseUrl: inherited }),
        },
      }),
    });
    const system = boundSource(workspace, source, { kind: 'bounded', limits });
    const roots: string[] = [];
    system.admitConfigurationRoot = (path) => {
      roots.push(path);
    };
    const project = parseProject(workspace, 'tsconfig.json', system, 'retained-config-roots');
    expect(roots).toEqual([...expected]);
    expect(project.configPath).toBe('tsconfig.json');
  });

test('previous modes preserve outside baseUrl as ordinary namespace probes', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], baseUrl: '/outside' },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  const system = boundSource(workspace, source, { kind: 'bounded', limits });
  system.admitConfigurationRoot = () => {
    throw new Error('unexpected explicit admission');
  };
  for (const mode of ['compatible', 'retained-type-roots'] as const)
    expect(parseProject(workspace, 'tsconfig.json', system, mode).configPath).toBe('tsconfig.json');
});

for (const [label, options, inherited, expected] of [
  [
    'declaring origin',
    {},
    { paths: { z: ['./types', '../shared', './types'], a: ['./other'] } },
    [
      '/candidate/configs/types',
      '/candidate/shared',
      '/candidate/configs/types',
      '/candidate/configs/other',
    ],
  ],
  [
    'prior roots then key order',
    {
      typeRoots: ['./types'],
      rootDirs: ['./generated'],
      baseUrl: './src',
      paths: { z: ['./last'], a: ['./first'] },
    },
    {},
    [
      '/candidate/types',
      '/candidate/generated',
      '/candidate/src',
      '/candidate/src/last',
      '/candidate/src/first',
    ],
  ],
  [
    'baseUrl override',
    { baseUrl: './src' },
    { paths: { unused: ['./types'] }, baseUrl: '../../outside' },
    ['/candidate/src', '/candidate/src/types'],
  ],
  [
    'child replacement',
    { paths: { local: ['./src/value.ts'] } },
    { paths: { discarded: ['/outside'] } },
    ['/candidate/src/value.ts'],
  ],
  ['empty child replacement', { paths: {} }, { paths: { discarded: ['/outside'] } }, []],
  [
    'wildcard key fixed substitution',
    { paths: { '@local/*': ['./src/value.ts', './src/*'] } },
    {},
    ['/candidate/src/value.ts'],
  ],
  [
    'normalized separators',
    { paths: { unused: ['.\\src\\..\\types', 'C:\\outside\\..\\types', '/outside/../types'] } },
    {},
    ['/candidate/types', 'C:/types', '/types'],
  ],
  [
    'consumer configDir expansion',
    {},
    { paths: { unused: ['${configDir}/types'] } },
    ['/candidate/types'],
  ],
] as const)
  test(`retained literal paths admission preserves ${label}`, () => {
    const { source } = fixture({
      'tsconfig.json': JSON.stringify({
        extends: './configs/base.json',
        compilerOptions: options,
        files: ['globals.d.ts', 'src/index.ts'],
      }),
      'configs/base.json': JSON.stringify({
        compilerOptions: { noLib: true, types: [], ignoreDeprecations: '6.0', ...inherited },
      }),
    });
    const system = boundSource(workspace, source, { kind: 'bounded', limits });
    const roots: string[] = [];
    system.admitConfigurationRoot = (path) => {
      roots.push(path);
    };
    const project = parseProject(workspace, 'tsconfig.json', system, 'retained-config-roots');
    expect(roots).toEqual([...expected]);
    expect(project.options.paths).toEqual(
      ts.parseJsonConfigFileContent(
        JSON.parse(source.readFile('/candidate/tsconfig.json') ?? 'null'),
        system,
        workspace,
        {},
        '/candidate/tsconfig.json',
      ).options.paths,
    );
  });

test('previous modes preserve literal paths as ordinary namespace probes', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], paths: { unused: ['/outside'] } },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  const system = boundSource(workspace, source, { kind: 'bounded', limits });
  system.admitConfigurationRoot = () => {
    throw new Error('unexpected explicit admission');
  };
  for (const mode of ['compatible', 'retained-type-roots'] as const)
    expect(parseProject(workspace, 'tsconfig.json', system, mode).configPath).toBe('tsconfig.json');
});

for (const shape of [
  'nonobject',
  'array-map',
  'primitive-map',
  'nonarray',
  'nonstring',
  'missing-origin',
  'nonstring-origin',
  'nonstring-base',
  'helper-absent',
  'helper-signature',
  'helper-version',
  'helper-return',
  'wildcard-only',
  'empty-map',
])
  test(`retained literal paths boundary ${shape} runs in isolated registry`, () => {
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--smol',
        'test',
        `${import.meta.dir}/typescript-literal-paths.test.fixture.ts`,
      ],
      {
        env: { ...process.env, LITERAL_PATHS_SHAPE: shape },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 20000,
      },
    );
    expect(child.stderr.toString()).toContain('1 pass');
    expect(child.exitCode).toBe(0);
  });
