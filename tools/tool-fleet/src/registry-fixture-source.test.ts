import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  quoteFixtureJson,
  quoteFixtureString,
  renderDockerFixture,
} from './registry-fixture-source';

const characters =
  '<</script>><</script>>\u2028\u2028\u2029\u2029' +
  Array.from({ length: 32 }, (_, index) => String.fromCharCode(index)).join('') +
  '"\\\'`🙂';
const payload = {
  ['__proto__']: { own: 'retained' },
  nested: [true, null, 3],
  characters,
  javascript: '");throw new Error("SENTINEL");({"',
  python: '");raise Exception("SENTINEL");#',
};

function runFixture(command: string[], directory: string) {
  const child = Bun.spawnSync(command, {
    cwd: directory,
    env: { PATH: '/usr/bin:/bin' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
  expect({ exit: child.exitCode, diagnostic: child.stderr.toString() }).toEqual({
    exit: 0,
    diagnostic: '',
  });
  return child.stdout.toString();
}

test('fixture literals globally exclude dangerous source characters without changing JSON data', () => {
  for (const literal of [quoteFixtureString(characters), quoteFixtureJson(payload)]) {
    expect(literal).not.toMatch(/[<>\u2028\u2029]/);
    const codeUnits = Array.from({ length: literal.length }, (_, index) =>
      literal.charCodeAt(index),
    );
    expect(codeUnits.every((codeUnit) => codeUnit >= 32)).toBe(true);
  }
});

test('public Bun and Python consume fixture values as inert JSON with own keys and Unicode', async () => {
  const directory = await scratchAsync('registry-fixture-source-');
  const literal = quoteFixtureJson(payload);
  for (const command of [
    [
      process.execPath,
      '--eval',
      `const decoded=JSON.parse(${literal});console.log(JSON.stringify(decoded));`,
    ],
    [
      '/usr/bin/python3',
      '-c',
      `import json; decoded=json.loads(${literal}); print(json.dumps(decoded))`,
    ],
  ]) {
    const decoded: unknown = JSON.parse(runFixture(command, directory));
    expect(decoded).toEqual(payload);
    if (decoded === null || typeof decoded !== 'object')
      throw new Error('Owned child emitted non-object JSON');
    expect(Object.hasOwn(decoded, '__proto__')).toBe(true);
  }
});

test('static fixture import paths survive quoting, bundling and copying as one artifact', async () => {
  const directory = await scratchAsync('registry-fixture-import-');
  const module = join(directory, 'quote"🙂.ts');
  await writeFile(module, 'export const token = "owned-static-import";\n');
  const entry = join(directory, 'entry.ts');
  await writeFile(entry, `import {token} from ${quoteFixtureString(module)};console.log(token);`);
  const bundle = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    outdir: join(directory, 'bundle'),
  });
  const artifact = bundle.outputs.at(0);
  if (!bundle.success || artifact === undefined) throw new Error('Owned fixture build failed');
  await mkdir(join(directory, 'copy'));
  const copied = join(directory, 'copy/pinned.js');
  await copyFile(artifact.path, copied);
  await rm(module);
  await rm(entry);
  expect(runFixture([process.execPath, copied], directory)).toBe('owned-static-import\n');
});

test('copied standalone Python Docker fixture keeps runtime values as data', async () => {
  const directory = await scratchAsync('registry-fixture-python-');
  const archive = join(directory, 'archive"\\🙂\n.tar');
  await writeFile(archive, 'owned archive contents');
  const imageId = 'sha256:' + 'a'.repeat(64);
  const observed = { Id: imageId, payload };
  const source = renderDockerFixture(imageId, observed, archive);
  const path = join(directory, 'copied-docker');
  await writeFile(path, source);
  const inspection = runFixture(
    ['/usr/bin/python3', path, 'image', 'inspect', '--format', 'fixture', imageId],
    directory,
  );
  expect(JSON.parse(inspection)).toEqual(observed);
  const output = join(directory, 'export.tar');
  expect(
    runFixture(['/usr/bin/python3', path, 'image', 'save', '--output', output, imageId], directory),
  ).toBe('');
  expect(await readFile(output, 'utf8')).toBe('owned archive contents');
});
