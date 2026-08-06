import { describe, expect, it } from 'bun:test';

import { deriveNumbers, type WorkItemPlacement } from './derive-numbers';

/** `id` doubles as the readable name in these tests; parents are named before their children. */
function place(id: string, parentId: string | null, position: number): WorkItemPlacement {
  return { id, parentId, position, frozenNumber: null };
}

/** Positions in the order given, spaced as the repository spaces them. */
function siblings(parentId: string | null, ...ids: string[]): WorkItemPlacement[] {
  return ids.map((id, i) => place(id, parentId, (i + 1) * 10));
}

describe('deriveNumbers', () => {
  it('numbers roots in tens', () => {
    const numbers = deriveNumbers(siblings(null, 'a', 'b', 'c'));

    expect(numbers.get('a')).toBe('010');
    expect(numbers.get('b')).toBe('020');
    expect(numbers.get('c')).toBe('030');
  });

  it('nests children under their parent', () => {
    const numbers = deriveNumbers([
      ...siblings(null, 'a'),
      ...siblings('a', 'a1', 'a2'),
      ...siblings('a2', 'a2x'),
    ]);

    expect(numbers.get('a1')).toBe('010.1');
    expect(numbers.get('a2')).toBe('010.2');
    expect(numbers.get('a2x')).toBe('010.2.1');
  });

  it('keeps nine children at one digit', () => {
    const kids = Array.from({ length: 9 }, (_, i) => `k${String(i)}`);
    const numbers = deriveNumbers([...siblings(null, 'a'), ...siblings('a', ...kids)]);

    expect(numbers.get('k0')).toBe('010.1');
    expect(numbers.get('k8')).toBe('010.9');
  });

  it('widens the whole group when a parent gains a tenth child', () => {
    const kids = Array.from({ length: 10 }, (_, i) => `k${String(i)}`);
    const numbers = deriveNumbers([...siblings(null, 'a'), ...siblings('a', ...kids)]);

    expect(numbers.get('k0')).toBe('010.01');
    expect(numbers.get('k9')).toBe('010.10');
  });

  it('widens one parent without touching a sibling parent', () => {
    const wide = Array.from({ length: 10 }, (_, i) => `w${String(i)}`);
    const numbers = deriveNumbers([
      ...siblings(null, 'a', 'b'),
      ...siblings('a', ...wide),
      ...siblings('b', 'n1', 'n2', 'n3'),
    ]);

    expect(numbers.get('w0')).toBe('010.01');
    expect(numbers.get('n1')).toBe('020.1');
    expect(numbers.get('n3')).toBe('020.3');
  });

  it('widens roots at the hundredth, where three characters stop sorting', () => {
    const many = Array.from({ length: 100 }, (_, i) => `r${String(i)}`);
    const numbers = deriveNumbers(siblings(null, ...many));

    expect(numbers.get('r0')).toBe('0010');
    expect(numbers.get('r98')).toBe('0990');
    expect(numbers.get('r99')).toBe('1000');
  });

  it('produces numbers that sort into tree order', () => {
    // Proof: this is the property the padding rules exist for. Unpadded, the
    // tenth child sorts second — ['010.1','010.10','010.2'] sorted byte-wise
    // yields 010.1, 010.10, 010.2 — which is why a tenth child widens the group.
    const kids = Array.from({ length: 10 }, (_, i) => `k${String(i)}`);
    const numbers = deriveNumbers([
      ...siblings(null, 'a', 'b'),
      ...siblings('a', ...kids),
      ...siblings('b', 'b1'),
    ]);

    const ordered = ['a', ...kids, 'b', 'b1'];
    const treeOrder = ordered.map((id) => numbers.get(id) ?? '');
    // Asserted before the sort: an implementation returning nothing would make
    // the comparison below hold vacuously, which is how this test passed
    // against a stub that returned an empty map.
    expect(treeOrder).toHaveLength(ordered.length);
    for (const number of treeOrder) expect(number).not.toBe('');

    expect([...treeOrder].sort()).toEqual(treeOrder);
  });

  it('refuses a work item whose parent is not in the project', () => {
    // An unreachable work item would otherwise be handed back with no number at
    // all, and the caller would render a row with an empty first column rather
    // than learn its tree is broken.
    expect(() => deriveNumbers([...siblings(null, 'a'), place('orphan', 'gone', 10)])).toThrow(
      /orphan/,
    );
  });
});

describe('deriveNumbers with frozen anchors', () => {
  const frozen = (id: string, position: number, frozenNumber: string): WorkItemPlacement => ({
    id,
    parentId: null,
    position,
    frozenNumber,
  });

  it('reports a frozen number verbatim', () => {
    const numbers = deriveNumbers([frozen('a', 10, '010'), frozen('b', 20, '020')]);

    expect(numbers.get('a')).toBe('010');
    expect(numbers.get('b')).toBe('020');
  });

  it('derives 011 between two frozen anchors', () => {
    const numbers = deriveNumbers([
      frozen('a', 10, '010'),
      place('new', null, 15),
      frozen('b', 20, '020'),
    ]);

    expect(numbers.get('new')).toBe('011');
  });

  it('appends a digit when the frozen anchors are adjacent', () => {
    const numbers = deriveNumbers([
      frozen('a', 10, '010'),
      place('new', null, 15),
      frozen('b', 20, '011'),
    ]);

    expect(numbers.get('new')).toBe('0105');
  });

  it('finds a label below the first frozen anchor', () => {
    const numbers = deriveNumbers([place('new', null, 5), frozen('a', 10, '010')]);

    const derived = numbers.get('new') ?? '';
    expect(derived < '010').toBe(true);
    expect(derived).not.toBe('');
  });

  it('keeps a partially frozen group in tree order', () => {
    const numbers = deriveNumbers([
      frozen('a', 10, '010'),
      place('mid', null, 15),
      frozen('b', 20, '020'),
      place('last', null, 30),
    ]);

    const inOrder = ['a', 'mid', 'b', 'last'].map((id) => numbers.get(id) ?? '');
    expect([...inOrder].sort()).toEqual(inOrder);
  });

  it('leaves a frozen child at the width it was frozen at', () => {
    const numbers = deriveNumbers([
      place('root', null, 10),
      { id: 'kid', parentId: 'root', position: 10, frozenNumber: '010.1' },
    ]);

    expect(numbers.get('kid')).toBe('010.1');
  });
});
