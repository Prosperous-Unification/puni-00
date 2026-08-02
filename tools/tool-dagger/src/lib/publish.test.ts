import { describe, expect, it } from 'bun:test';

import { imageRef, parseDigest, type ReleaseRecord, renderRelease } from './publish';

describe('imageRef', () => {
  it('builds a registry-qualified tagged ref', () => {
    expect(imageRef('registry.infra.bulletpoints.club', 'be', 'abc1234')).toBe(
      'registry.infra.bulletpoints.club/wbs-be-01:abc1234',
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

describe('renderRelease', () => {
  it('round-trips through JSON', () => {
    const rec: ReleaseRecord = {
      be: { sha: 'abc1234', digest: 'sha256:' + 'b'.repeat(64), ref: 'r/wbs-be-01:abc1234' },
    };
    expect(JSON.parse(renderRelease(rec))).toEqual(rec);
  });
});
