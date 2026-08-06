import { describe, expect, it } from 'vitest';

import { pickerEntries } from './dep-picker';

const rows = [
  { id: 'a', number: '010', name: 'Design API' },
  { id: 'b', number: '020', name: 'Build gateway' },
  { id: 'c', number: '030', name: 'Smoke test' },
  { id: 'd', number: '030.1', name: 'Forward probe' },
];

describe('pickerEntries', () => {
  it('offers every other row when nothing is typed', () => {
    const offered = pickerEntries(rows, { id: 'b', dependsOn: [] }, '');
    expect(offered.map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });

  it('filters by number substring', () => {
    const offered = pickerEntries(rows, { id: 'b', dependsOn: [] }, '030');
    expect(offered.map((r) => r.number)).toEqual(['030', '030.1']);
  });

  it('filters by name, case-insensitively', () => {
    const offered = pickerEntries(rows, { id: 'b', dependsOn: [] }, 'des');
    expect(offered.map((r) => r.name)).toEqual(['Design API']);
  });

  it('never offers the row itself or its existing predecessors', () => {
    const offered = pickerEntries(rows, { id: 'b', dependsOn: ['a'] }, '');
    expect(offered.map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('offers nothing when nothing matches', () => {
    expect(pickerEntries(rows, { id: 'b', dependsOn: [] }, 'zzz')).toEqual([]);
  });

  it('ignores surrounding whitespace in the filter', () => {
    const offered = pickerEntries(rows, { id: 'b', dependsOn: [] }, '  smoke ');
    expect(offered.map((r) => r.id)).toEqual(['c']);
  });
});
