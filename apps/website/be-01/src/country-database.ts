import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import type { AnalyticsRegion, AnalyticsRegionResponse } from '@website/contracts';
import { type CountryResponse, Reader } from 'mmdb-lib';

import release from './assets/country/release.json';

/** Recorded identities of the unchanged provider release; copied with the runtime package. */
export const countryRelease = release;

/** A reader loaded once at startup, with no network lookup or visitor persistence. */
export interface CountryDatabase {
  /** Resolves a full selected IP address; never pass the source-hashing /64 prefix. */
  resolveRegion(address: string, now: number): AnalyticsRegionResponse;
}

// ISO 3166-1 alpha-2: assigned country/territory codes, including the EU outermost regions.
const countries = new Set(
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  ),
);
const consentCountries = new Set(
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE GB CH AX GF GP MQ RE YT MF'.split(
    ' ',
  ),
);

/** EEA30, GB, CH and EU outermost/Åland codes require a choice; unrecognized codes stay unknown. */
export function classifyCountry(country: string | undefined): AnalyticsRegion {
  // Proof: removing recognition made the real decoded-MMDB ZZ fixture resolve elsewhere.
  if (country === undefined || !countries.has(country)) return 'unknown';
  return consentCountries.has(country) ? 'consent-required' : 'elsewhere';
}

function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Loads a configured gzip asset once, verifying both SHA-256 identities, bounded decompression
 * (64 MiB) and the MMDB country kind. Source and compiled main use the same relative asset path.
 * Missing, unreadable, changed or malformed assets throw before the server starts. The optional
 * release argument lets a maintenance verification inspect a proposed replacement explicitly.
 */
export function loadCountryDatabase(
  path = join(import.meta.dir, 'assets/country', countryRelease.archive),
  expected = countryRelease,
): CountryDatabase {
  // Proof: falling back to the bundled archive made missing and chmod-000 tests each fail (no throw).
  let archive: Buffer;
  try {
    archive = readFileSync(path);
  } catch (cause) {
    throw new Error('Country database archive cannot be read', { cause });
  }
  // Proof: removing this guard changed the corrupt-archive refusal to decompress and failed its test.
  if (hashBytes(archive) !== expected.archiveSha256)
    throw new Error('Country database archive SHA-256 mismatch');
  let bytes: Buffer;
  try {
    // Proof: a 128 MiB limit admitted the oversized gzip and failed the expected decompress refusal.
    bytes = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
  } catch (cause) {
    throw new Error('Country database decompress failed', { cause });
  }
  // Proof: removing this guard admitted a mismatched extracted identity in the real-reader test.
  if (hashBytes(bytes) !== expected.databaseSha256)
    throw new Error('Country database SHA-256 mismatch');
  let reader: Reader<CountryResponse>;
  try {
    reader = new Reader<CountryResponse>(bytes);
  } catch (cause) {
    throw new Error('Country database decode failed', { cause });
  }
  // Proof: removing this guard admitted the re-encoded DBIP-Unknown-Lite MMDB fixture.
  if (reader.metadata.databaseType !== 'DBIP-Country-Lite')
    throw new Error('Country database kind must be DBIP-Country-Lite');
  const nextMonth = new Date(`${expected.month}-01T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const refreshDue = nextMonth.toISOString().slice(0, 10);
  return {
    resolveRegion(address, now) {
      // MMDB bytes and kind are verified above; validate the decoded record at its boundary too.
      const record: unknown = reader.get(address);
      let country: string | undefined;
      if (record !== null) {
        const estimate: unknown =
          typeof record === 'object' ? Reflect.get(record, 'country') : null;
        const code: unknown =
          typeof estimate === 'object' && estimate !== null
            ? Reflect.get(estimate, 'iso_code')
            : null;
        // Proof: removing this refusal let the re-encoded countrz record pass the malformed-record test.
        if (typeof code !== 'string') throw new Error('Country database record is malformed');
        country = code;
      }
      return {
        region: classifyCountry(country),
        database: {
          month: expected.month,
          refreshDue,
          // Proof: forcing false failed the real-reader test at 2026-12-01T00:00:00Z.
          updateDue: now >= nextMonth.getTime(),
        },
      };
    },
  };
}
