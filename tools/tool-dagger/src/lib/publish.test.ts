import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { digestRef, imageRef, parseDigest, type ReleaseRecord, renderRelease } from './publish';

describe('imageRef', () => {
  it('builds a registry-qualified tagged ref', () => {
    expect(imageRef('registry.infra.bulletpoints.club', 'be', 'abc1234')).toBe(
      'registry.infra.bulletpoints.club/wbs-be-01:abc1234',
    );
  });

  it('names the MCP release image by its own tier', () => {
    expect(imageRef('registry.infra.bulletpoints.club', 'mcp', 'abc1234')).toBe(
      'registry.infra.bulletpoints.club/wbs-mcp-01:abc1234',
    );
  });

  it('rejects an empty sha rather than publishing a floating tag', () => {
    expect(() => imageRef('r.example.com', 'be', '')).toThrow(/sha/);
  });
});

describe('parseDigest', () => {
  it('extracts the digest from a publish result', () => {
    const out = 'registry.infra.bulletpoints.club/wbs-be-01:abc1234@sha256:' + 'a'.repeat(64);
    expect(parseDigest(out)).toBe('sha256:' + 'a'.repeat(64));
  });

  it('throws when no digest is present, so a deploy never falls back to a tag', () => {
    expect(() => parseDigest('registry.example.com/wbs-be-01:abc1234')).toThrow(/digest/);
  });
});

describe('digestRef', () => {
  const digest = 'sha256:' + 'c'.repeat(64);

  // The single source of truth for the publish address: this exact string is
  // what `swap.js` pulls, rather than each side rebuilding it from its own
  // REGISTRY default (which is how the two came to disagree).
  it('builds the whole address+digest a deploy pulls', () => {
    expect(digestRef('registry.infra.bulletpoints.club', 'be', digest)).toBe(
      `registry.infra.bulletpoints.club/wbs-be-01@${digest}`,
    );
  });

  it('rejects anything that is not a well-formed sha256 digest', () => {
    expect(() => digestRef('r.example.com', 'be', 'sha256:tooshort')).toThrow(/digest/);
    expect(() => digestRef('r.example.com', 'be', 'abc1234')).toThrow(/digest/);
  });
});

describe('renderRelease', () => {
  it('records the digest-pinned image ref alongside the tag it was pushed to', () => {
    const digest = 'sha256:' + 'b'.repeat(64);
    const rec: ReleaseRecord = {
      be: {
        sha: 'abc1234',
        digest,
        ref: 'r.example.com/wbs-be-01:abc1234',
        image: digestRef('r.example.com', 'be', digest),
      },
    };
    const parsed = JSON.parse(renderRelease(rec)) as ReleaseRecord;
    expect(parsed).toEqual(rec);
    expect(parsed.be?.image).toBe(`r.example.com/wbs-be-01@${digest}`);
  });
});

describe('managed publication', () => {
  it('refuses a partial product and unenforced scratch before the Dagger exporter runs', async () => {
    const { publishManagedRelease } = await import('./publish');
    const { readFile, rm } = await import('node:fs/promises');
    const directory = await scratchAsync('dagger-publication-');
    const enrollment = {
      schemaVersion: 1 as const,
      registryUrl: 'https://registry.example',
      registryId: 'proof',
      authorityMachineId: '0'.repeat(32),
      registryPath: '/registry',
      journalPath: '/journal',
      sshHost: 'proof-host',
      owner: 'proof',
      product: 'wbs',
      requiredRepositories: ['wbs-be-01', 'wbs-gw-01'],
      builder: {
        uid: process.getuid?.() ?? -1,
        machineId: (await readFile('/etc/machine-id', 'utf8')).trim(),
        path: directory,
        receiptPath: directory + '/absent.receipt',
        maximumBytes: 1024,
        maximumInodes: 1,
        excludedFilesystems: [],
      },
    };
    let exported = 0;
    const exportTier = () => {
      exported += 1;
      return Promise.reject(new Error('export reached'));
    };
    try {
      for (const tiers of [['be'], ['be', 'gw']] as const) {
        let refused = false;
        try {
          await publishManagedRelease(
            enrollment,
            { url: enrollment.registryUrl },
            tiers,
            'proof',
            exportTier,
          );
        } catch (cause) {
          if (!(cause instanceof Error)) throw cause;
          refused = true;
        }
        expect(refused).toBe(true);
        expect(exported).toBe(0);
      }
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

it('managed Dagger caller forwards schema4 ownership into the real HTTP uploader', async () => {
  const child = Bun.spawn(
    [process.execPath, new URL('./publish-ownership.fixture.ts', import.meta.url).pathname],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, output, diagnostic] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, diagnostic }).toEqual({ code: 0, diagnostic: '' });
  expect(output).toContain('2 bodies');
});

it('managed Dagger caller refuses foreign endpoints before every publication effect', async () => {
  const child = Bun.spawn(
    [process.execPath, new URL('./publish-endpoint.fixture.ts', import.meta.url).pathname],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, output, diagnostic] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, diagnostic }).toEqual({ code: 0, diagnostic: '' });
  expect(output).toContain(
    '3 endpoint refusals: zero effects; matching endpoint reaches admission',
  );
});
