import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'bun:test';

import { compareCompilerMetadata, orderCompilerMetadata } from './forge-compiler-metadata';

const roots = new Map<string, { canRetire: boolean }>();
afterEach(() => {
  const failures: unknown[] = [];
  for (const [root, custody] of roots) {
    if (!custody.canRetire) {
      failures.push(new Error('compiler fixture settlement unconfirmed; retained ' + root));
      continue;
    }
    try { rmSync(root, { recursive: true }); roots.delete(root); }
    catch (cause: unknown) { failures.push(cause); }
  }
  if (failures.length !== 0) throw new AggregateError(failures, 'compiler metadata fixture retirement failed');
});

it('actual Bun compiler metadata accepts dictionary reorder and refuses changed missing extra members and ordered arrays', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni-forge-compiler-metadata-'));
  const custody = { canRetire: false };
  roots.set(root, custody);
  writeFileSync(join(root, 'one.ts'), 'export const one = 7;\n');
  writeFileSync(join(root, 'two.ts'), 'export const two = 11;\n');
  for (const entry of ['alpha', 'beta'])
    writeFileSync(join(root, entry + '.ts'), 'import {one} from "./one";import {two} from "./two";' +
      'export const ' + entry + '=one+two;export const extra=one*two;\n');
  const built = await Bun.build({
    entrypoints: [join(root, 'alpha.ts'), join(root, 'beta.ts')],
    target: 'bun', format: 'esm', env: 'disable', root, metafile: true,
  });
  expect(built.success, built.logs.map(String).join('\n')).toBe(true);
  expect(built.logs).toHaveLength(0);
  expect(built.outputs).toHaveLength(2);
  const metadata = built.metafile;
  if (metadata === undefined) throw new Error('actual compiler supplied no metadata');
  const inputKey = Object.keys(metadata.inputs).at(0), outputKey = Object.keys(metadata.outputs).at(0);
  const importsKey = Object.keys(metadata.inputs).find(key => metadata.inputs[key].imports.length >= 2);
  const exportsKey = Object.keys(metadata.outputs).find(key => metadata.outputs[key].exports.length >= 2);
  if (inputKey === undefined || outputKey === undefined || importsKey === undefined || exportsKey === undefined)
    throw new Error('actual compiler did not expose the required independent metadata members/arrays');
  expect(Object.keys(metadata.inputs).length).toBeGreaterThan(1);
  expect(Object.keys(metadata.outputs).length).toBeGreaterThan(1);
  const emitted = await Promise.all(built.outputs.map(async artifact => {
    const bytes = new Uint8Array(await artifact.arrayBuffer());
    expect(bytes.byteLength).toBe(artifact.size);
    return { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  const reversed: Bun.BuildMetafile = {
    ...metadata,
    inputs: Object.fromEntries(Object.entries(metadata.inputs).reverse()),
    outputs: Object.fromEntries(Object.entries(metadata.outputs).reverse()),
  };
  expect(Object.keys(reversed.inputs)).not.toEqual(Object.keys(metadata.inputs));
  expect(Object.keys(reversed.outputs)).not.toEqual(Object.keys(metadata.outputs));
  expect(compareCompilerMetadata(metadata, reversed)).toEqual({ kind: 'same' });
  const ordered = orderCompilerMetadata(metadata);
  expect(Object.keys(ordered.inputs)).toEqual([...Object.keys(metadata.inputs)].sort());
  expect(Object.keys(ordered.outputs)).toEqual([...Object.keys(metadata.outputs)].sort());
  for (const key of Object.keys(metadata.inputs)) expect(ordered.inputs[key]).toBe(metadata.inputs[key]);
  for (const key of Object.keys(metadata.outputs)) expect(ordered.outputs[key]).toBe(metadata.outputs[key]);
  const variants: { readonly name: string; readonly change: (metadata: Bun.BuildMetafile) => void }[] = [
    { name: 'changed input value', change: selected => { selected.inputs[inputKey].bytes += 1; } },
    { name: 'missing input key', change: selected => { delete selected.inputs[inputKey]; } },
    { name: 'extra input key', change: selected => { selected.inputs['owned-extra-input.ts'] = structuredClone(selected.inputs[inputKey]); } },
    { name: 'changed output value', change: selected => { selected.outputs[outputKey].bytes += 1; } },
    { name: 'missing output key', change: selected => { delete selected.outputs[outputKey]; } },
    { name: 'extra output key', change: selected => { selected.outputs['owned-extra-output.js'] = structuredClone(selected.outputs[outputKey]); } },
    { name: 'extra input member', change: selected => { Object.assign(selected.inputs[inputKey], { ownedExtra: true }); } },
    { name: 'extra output member', change: selected => { Object.assign(selected.outputs[outputKey], { ownedExtra: true }); } },
    { name: 'own __proto__ input key', change: selected => { Object.defineProperty(selected.inputs, '__proto__', {
      value: structuredClone(selected.inputs[inputKey]), enumerable: true, configurable: true, writable: true,
    }); } },
    { name: 'own __proto__ output key', change: selected => { Object.defineProperty(selected.outputs, '__proto__', {
      value: structuredClone(selected.outputs[outputKey]), enumerable: true, configurable: true, writable: true,
    }); } },
    { name: 'import order', change: selected => { selected.inputs[importsKey].imports.reverse(); } },
    { name: 'export order', change: selected => { selected.outputs[exportsKey].exports.reverse(); } },
  ];
  for (const variant of variants) {
    const changed = structuredClone(metadata);
    variant.change(changed);
    expect(JSON.stringify(changed), variant.name).not.toBe(JSON.stringify(metadata));
    expect(compareCompilerMetadata(metadata, changed).kind, variant.name).toBe('different');
  }
  const emittedAfter = await Promise.all(built.outputs.map(async artifact => {
    const bytes = new Uint8Array(await artifact.arrayBuffer());
    return { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  custody.canRetire = true;
  expect(emittedAfter).toEqual(emitted);
}, 30000);
