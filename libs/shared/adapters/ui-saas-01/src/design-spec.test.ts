import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'bun:test';

import { listPrimitives } from './exports.testing';

const designSpec = await readFile(new URL('../DESIGN.md', import.meta.url), 'utf8');

/** The body of `## <name>`, up to the next `## ` heading; `undefined` when there is no such heading. */
function readSection(name: string): string | undefined {
  const sections = designSpec.split(/^(?=## )/m);
  return sections.find((section) => section.startsWith(`## ${name}\n`));
}

describe('the kit DESIGN.md', () => {
  const primitives = listPrimitives();

  it('finds the primitives the kit exports', () => {
    expect(primitives.map(({ name }) => name)).toContain('Button');
    expect(primitives.find(({ name }) => name === 'Modal')?.parts).toContain('ModalContent');
  });

  it('has a section for every exported primitive', () => {
    // Proof: deleting the `## Label` heading made this read `["Label"]` and fail (2026-10-21).
    expect(
      primitives.map(({ name }) => name).filter((name) => readSection(name) === undefined),
    ).toEqual([]);
  });

  it("names every part in its primitive's section", () => {
    const unnamed = primitives.flatMap(({ name, parts }) =>
      parts.filter((part) => !(readSection(name) ?? '').includes(`\`${part}\``)),
    );
    expect(unnamed).toEqual([]);
  });

  it('documents every control helper', async () => {
    const control = await readFile(new URL('./control.ts', import.meta.url), 'utf8');
    const names = [...control.matchAll(/^export const ([A-Z_]+)/gm)].map(([, name]) => name);
    expect(names.length).toBe(4);
    expect(
      names.filter((name) => !(readSection('Control helpers') ?? '').includes(`\`${name}\``)),
    ).toEqual([]);
  });
});
