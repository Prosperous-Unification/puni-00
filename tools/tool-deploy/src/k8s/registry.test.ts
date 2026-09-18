import { afterEach, describe, expect, it } from 'bun:test';

import { fakeRegistry } from './fake-registry';
import { assertImageRevisions, registryRevisionReader } from './registry';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

function registry(
  labels: Record<string, string | null>,
  options: { lie?: boolean; user?: string } = {},
) {
  const fake = fakeRegistry(labels, options);
  stops.push(fake.stop);
  return fake;
}

const source = 'a'.repeat(40);

describe('image revision labels read from the registry', () => {
  it('accepts images labelled with the source commit, through an index, with auth', async () => {
    const { ref } = registry({ 'wbs-be-01': source, 'wbs-gw-01': source }, { user: 'u:p' });
    await assertImageRevisions(
      { backend: ref('wbs-be-01'), gateway: ref('wbs-gw-01') },
      source,
      registryRevisionReader('u:p'),
    );
  });

  it('refuses an image built from another commit', async () => {
    const { ref } = registry({ 'wbs-be-01': source, 'wbs-gw-01': '9'.repeat(40) });
    expect(
      await assertImageRevisions(
        { backend: ref('wbs-be-01'), gateway: ref('wbs-gw-01') },
        source,
        registryRevisionReader(null),
      ).then(
        () => 'accepted',
        (e: unknown) => String(e),
      ),
    ).toContain(`gateway ${ref('wbs-gw-01')} is labelled WBS_SHA=${'9'.repeat(40)}`);
  });

  it('refuses an unlabelled image', async () => {
    const { ref } = registry({ 'wbs-mcp-01': null });
    expect(
      await assertImageRevisions(
        { mcp: ref('wbs-mcp-01') },
        source,
        registryRevisionReader(null),
      ).then(
        () => 'accepted',
        (e: unknown) => String(e),
      ),
    ).toContain('is labelled WBS_SHA=null');
  });

  it('refuses a registry that answers a digest with other bytes', async () => {
    const { ref } = registry({ 'wbs-be-01': source }, { lie: true });
    expect(
      await registryRevisionReader(null)(ref('wbs-be-01')).then(
        () => 'read',
        (e: unknown) => String(e),
      ),
    ).toContain('returned bytes that are not');
  });
});
