import { describe, expect, it } from 'bun:test';

import { digestRef, imageRef, parseDigest, type ReleaseRecord, renderRelease } from './publish';

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
