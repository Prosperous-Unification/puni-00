import { describe, expect, test } from 'bun:test';

import { canonicalJson, digestBytes, digestOf, verifyDigest } from './canonical';

const record = { schemaVersion: 1, kind: 'sample', nested: { b: [2, 'x'], a: true }, empty: null };

describe('canonical record digests', () => {
  test('serializes sorted keys without whitespace', () => {
    expect(canonicalJson(record)).toBe(
      '{"empty":null,"kind":"sample","nested":{"a":true,"b":[2,"x"]},"schemaVersion":1}',
    );
  });

  test('is byte-stable across key order', () => {
    const reordered = {
      nested: { a: true, b: [2, 'x'] },
      empty: null,
      kind: 'sample',
      schemaVersion: 1,
    };
    expect(digestOf(reordered)).toBe(digestOf(record));
    expect(digestOf(record)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a changed field changes the digest', () => {
    expect(digestOf({ ...record, kind: 'other' })).not.toBe(digestOf(record));
  });

  test('refuses values JSON cannot carry exactly', () => {
    expect(() => canonicalJson({ value: undefined })).toThrow(/undefined/);
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(/finite/);
    expect(() => canonicalJson({ value: new Date(0) })).toThrow(/plain/);
  });

  test('verifyDigest accepts the record it digested and refuses a tampered one', () => {
    const digested = { ...record, recordDigest: digestOf(record) };
    expect(() => {
      verifyDigest(digested, 'recordDigest');
    }).not.toThrow();
    expect(() => {
      verifyDigest({ ...digested, kind: 'tampered' }, 'recordDigest');
    }).toThrow(/recordDigest does not match/);
  });

  test('verifyDigest refuses a record without its digest field', () => {
    expect(() => {
      verifyDigest(record, 'recordDigest');
    }).toThrow(/has no recordDigest/);
  });
});

test('hashes exact bytes using the SHA-256 empty known vector', () => {
  expect(digestBytes(new Uint8Array())).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  expect(digestBytes(Uint8Array.from([0x61, 0x62, 0x63]))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
