import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { afterEach, expect, test } from 'bun:test';

import { classifyCountry, countryRelease, loadCountryDatabase } from './country-database';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function createArchivePath() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-country-'));
  directories.push(directory);
  return join(directory, 'country.mmdb.gz');
}
const archivePath = join(import.meta.dir, 'assets/country/dbip-country-lite-2026-11.mmdb.gz');
const beforeDue = Date.UTC(2026, 10, 30, 23, 59, 59);

test('real DB-IP resolves IPv4 and full IPv6 locally and leaves loopback unknown', () => {
  const database = loadCountryDatabase();
  for (const [address, region] of [
    ['8.8.8.8', 'elsewhere'],
    ['80.158.1.1', 'consent-required'],
    ['2a00:1450:4001:800::200e', 'consent-required'],
    ['127.0.0.1', 'unknown'],
  ] as const)
    expect(database.resolveRegion(address, beforeDue)).toEqual({
      region,
      database: {
        month: '2026-11',
        refreshDue: '2026-12-01',
        updateDue: false,
      },
    });
});

test('recognized country policy covers EEA, associated territories, UK and Switzerland', () => {
  for (const code of 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE GB CH AX GF GP MQ RE YT MF'.split(
    ' ',
  ))
    expect(classifyCountry(code)).toBe('consent-required');
  for (const code of ['US', 'UA', 'CA', 'JP', 'AU'])
    expect(classifyCountry(code)).toBe('elsewhere');
  for (const code of ['ZZ', 'XX', 'EU', 'us', '', undefined])
    expect(classifyCountry(code)).toBe('unknown');
});

test('the next UTC month becomes due without claiming a refreshed release', () => {
  const database = loadCountryDatabase();
  expect(database.resolveRegion('8.8.8.8', Date.UTC(2026, 11, 1)).database).toEqual({
    month: '2026-11',
    refreshDue: '2026-12-01',
    updateDue: true,
  });
});

test('missing configured archive refuses loading', () => {
  const path = createArchivePath();
  expect(() => loadCountryDatabase(path)).toThrow('Country database');
});

test('unreadable configured archive refuses loading', () => {
  const path = createArchivePath();
  writeFileSync(path, readFileSync(archivePath));
  chmodSync(path, 0);
  try {
    expect(() => loadCountryDatabase(path)).toThrow('Country database');
  } finally {
    chmodSync(path, 0o600);
  }
});

test('corrupt and changed configured archives refuse loading', () => {
  const path = createArchivePath();
  writeFileSync(path, 'not gzip');
  expect(() => loadCountryDatabase(path)).toThrow('archive SHA-256');
  const changed = Buffer.from(readFileSync(archivePath));
  changed[20] ^= 1;
  writeFileSync(path, changed);
  expect(() => loadCountryDatabase(path)).toThrow('archive SHA-256');
});

test('matching archive identity cannot bypass extracted hash, decoder, kind or decompression bounds', () => {
  const path = createArchivePath();
  const hashBytes = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const archive = readFileSync(archivePath);
  expect(() =>
    loadCountryDatabase(archivePath, { ...countryRelease, databaseSha256: '0'.repeat(64) }),
  ).toThrow('database SHA-256');
  for (const [bytes, reason] of [
    [Buffer.from('invalid gzip'), 'decompress'],
    [gzipSync(Buffer.from('invalid mmdb')), 'decode'],
    [gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1)), 'decompress'],
  ] as const) {
    writeFileSync(path, bytes);
    const databaseSha256 =
      reason === 'decode' ? hashBytes(Buffer.from('invalid mmdb')) : countryRelease.databaseSha256;
    expect(() =>
      loadCountryDatabase(path, {
        ...countryRelease,
        archiveSha256: hashBytes(bytes),
        databaseSha256,
      }),
    ).toThrow(reason);
  }
  const wrongKind = Buffer.from(gunzipSync(archive));
  const offset = wrongKind.indexOf('DBIP-Country-Lite');
  expect(offset).toBeGreaterThan(0);
  wrongKind.write('DBIP-Unknown-Lite', offset);
  const wrongArchive = gzipSync(wrongKind);
  writeFileSync(path, wrongArchive);
  expect(() =>
    loadCountryDatabase(path, {
      ...countryRelease,
      archiveSha256: hashBytes(wrongArchive),
      databaseSha256: hashBytes(wrongKind),
    }),
  ).toThrow('kind');
});

test('unrecognized decoded country stays unknown and malformed mapped records throw', () => {
  const original = gunzipSync(readFileSync(archivePath));
  const path = createArchivePath();
  for (const [needle, replacement, expected] of [
    [Buffer.from([0x42, 0x55, 0x53]), Buffer.from([0x42, 0x5a, 0x5a]), 'unknown'],
    [Buffer.from('country'), Buffer.from('countrz'), 'malformed'],
  ] as const) {
    const changed = Buffer.from(original);
    let offset = changed.indexOf(needle);
    expect(offset).toBeGreaterThan(0);
    while (offset !== -1) {
      replacement.copy(changed, offset);
      offset = changed.indexOf(needle, offset + needle.length);
    }
    const archive = gzipSync(changed);
    writeFileSync(path, archive);
    const database = loadCountryDatabase(path, {
      ...countryRelease,
      archiveSha256: createHash('sha256').update(archive).digest('hex'),
      databaseSha256: createHash('sha256').update(changed).digest('hex'),
    });
    if (expected === 'unknown')
      expect(database.resolveRegion('8.8.8.8', beforeDue).region).toBe('unknown');
    else expect(() => database.resolveRegion('8.8.8.8', beforeDue)).toThrow('record is malformed');
  }
});
