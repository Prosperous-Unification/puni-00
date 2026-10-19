import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { globals } from './typescript.test.fixture';

/** Shared ambient declarations amplify program retention without amplifying the public report. */
export function writeSerialFixture(root: string, declarations = 0, consumers = 2) {
  const files: Record<string, string> = {
    'package.json': '{"name":"serial-compiler-fixture","private":true}',
    'nx.json': '{"plugins":[],"useInferencePlugins":false}',
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        noLib: true,
        types: [],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        rootDir: '.',
        strict: true,
        target: 'ES2022',
      },
    }),
    'globals.d.ts': `${globals}\n${Array.from(
      { length: declarations },
      (_, index) => `interface Ambient${String(index)} { value: number; }`,
    ).join('\n')}\n`,
    'src/index.ts': 'export const value = 1;\n',
    'src/consumer.ts': "import { value } from './index'; export const copied = value;\n",
    'config/provider.json': JSON.stringify({
      extends: '../tsconfig.json',
      files: ['../globals.d.ts', '../src/index.ts'],
      include: [],
    }),
  };
  const configPaths = ['config/provider.json'];
  for (let index = 0; index < consumers; index += 1) {
    const path = `config/consumer-${String(index)}.json`;
    configPaths.push(path);
    files[path] = JSON.stringify({
      extends: '../tsconfig.json',
      files: ['../globals.d.ts', '../src/consumer.ts'],
      include: [],
    });
  }
  for (const [path, text] of Object.entries(files)) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, text);
  }
  return { configPaths, publicEntrypoints: ['src/index.ts'] };
}
