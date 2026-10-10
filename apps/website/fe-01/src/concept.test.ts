import { expect, test } from 'bun:test';

import { parseConcept } from './concept';

const valid = {
  kind: 'concept',
  template: 'booking',
  title: 'Studio booking',
  summary: 'Reserve a class.',
  sections: [{ title: 'Choose', body: 'Pick a class.' }],
  simulated: true,
  provider: 'demo',
  revision: 0,
};

test('accepts a bounded fixed-component concept', () => {
  expect(parseConcept(valid).template).toBe('booking');
});

test('rejects executable, remote, oversized, or unknown concept fields at the UI boundary', () => {
  for (const malformed of [
    { ...valid, template: 'html' },
    { ...valid, title: '<script>alert(1)</script>' },
    { ...valid, summary: 'See https://outside.example/asset' },
    { ...valid, sections: Array.from({ length: 9 }, () => ({ title: 'X', body: 'Y' })) },
    { ...valid, onClick: 'alert(1)' },
    { ...valid, simulated: false },
  ])
    expect(() => parseConcept(malformed)).toThrow();
});
