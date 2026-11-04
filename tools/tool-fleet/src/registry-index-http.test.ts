import { expect, it } from 'bun:test';

import { readRegistryIndexPublication } from './registry-maintenance-index.native';

const content = (letter: string) => 'sha256:' + letter.repeat(64);
const stdout = JSON.stringify({
  revision: 1,
  operationId: 'owned',
  root: content('a'),
  manifests: ['a', 'b', 'c'].map(content),
  blobs: ['d', 'e', 'f', '1'].map(content),
});
const observation = {
  events: [
    {
      started: 1,
      finished: 2,
      method: 'PUT',
      path: 'manifest',
      endpoint: 'ordinary',
      status: 201,
      transport: 'none',
    },
  ],
  truncated: false,
  pending: 0,
};
const stderr = (input: unknown = observation) =>
  'task8-population-http:' + JSON.stringify(input) + '\n';

it('emits the validated native HTTP observation before accepting a publication', () => {
  const lines: string[] = [];
  const receipt = readRegistryIndexPublication(1, { code: 0, stdout, stderr: stderr() }, (line) =>
    lines.push(line),
  );
  expect(receipt.operationId).toBe('owned');
  expect(lines.map((line): unknown => JSON.parse(line))).toEqual([
    { indexPublicationHttp: { revision: 1, state: 'valid', observation } },
  ]);
});
it('emits existing owner failure and exact HTTP status before rejecting a failed owner', () => {
  const lines: string[] = [];
  const failed = { ...observation, events: [{ ...observation.events[0], status: 405 }] };
  expect(() =>
    readRegistryIndexPublication(1, { code: 1, stdout, stderr: stderr(failed) }, (line) =>
      lines.push(line),
    ),
  ).toThrow('Managed index publication failed');
  expect(lines).toHaveLength(2);
  const owner: unknown = JSON.parse(lines[0]);
  const http: unknown = JSON.parse(lines[1]);
  expect(owner).toMatchObject({ indexOwnerFailure: { mode: 'index-publish-1' } });
  expect(http).toMatchObject({
    indexPublicationHttp: { observation: { events: [{ status: 405 }] } },
  });
});
it('never accepts an absent, invalid or unfinished required observation despite successful owner output', () => {
  for (const observed of [
    '',
    stderr({ ...observation, privateText: 'do-not-reflect' }),
    stderr({ ...observation, pending: 1 }),
  ]) {
    const lines: string[] = [];
    expect(() =>
      readRegistryIndexPublication(1, { code: 0, stdout, stderr: observed }, (line) =>
        lines.push(line),
      ),
    ).toThrow('Index HTTP observation is incomplete');
    expect(lines.join('')).not.toContain('do-not-reflect');
  }
});
