import { describe, expect, it } from 'vitest';

import { matchingProjects } from './project-picker';

const projects = [
  { id: 'p1', name: 'Rewire the shed' },
  { id: 'p2', name: 'Repaint the hall' },
  { id: 'p3', name: 'HALLWAY lighting' },
];

describe('matchingProjects', () => {
  it('offers everything when nothing is typed', () => {
    expect(matchingProjects(projects, '').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(matchingProjects(projects, '   ').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('matches a substring of the name, ignoring case', () => {
    expect(matchingProjects(projects, 'hall').map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(matchingProjects(projects, 'SHED').map((p) => p.id)).toEqual(['p1']);
  });

  it('keeps the order it was given rather than sorting by name or match', () => {
    // The server's order is this account's recency order. A picker that
    // re-sorted would quietly overrule it — `hall` matching `Repaint the hall`
    // at position 8 and `HALLWAY lighting` at position 0 must not promote the
    // second one.
    const reversed = [...projects].reverse();
    expect(matchingProjects(reversed, 'hall').map((p) => p.id)).toEqual(['p3', 'p2']);
  });

  it('offers nothing when nothing matches', () => {
    expect(matchingProjects(projects, 'garage')).toEqual([]);
  });
});
