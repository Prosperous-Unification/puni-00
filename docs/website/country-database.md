# Country database maintenance

**Next manual download: 1 December 2026 (2026-12-01).** Download the next DB-IP
IP to Country Lite MMDB release from the [official download page](https://db-ip.com/db/download/ip-to-country-lite).
This is a dated maintenance reminder, not a scheduled notification. There is no
automatic downloader or per-visitor request to DB-IP.

The canonical release and integrity identities live in
[`release.json`](../../apps/website/be-01/src/assets/country/release.json).
The unchanged provider database is retained as gzip beside that manifest and its
[`NOTICE.txt`](../../apps/website/be-01/src/assets/country/NOTICE.txt).
It is licensed separately under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):
**[IP Geolocation by DB-IP](https://db-ip.com)**. Keep the notice and visible page
credit when copying projects or distributing the API package.

The API loads and verifies the database once before serving. Lookups use the full
client address selected by the existing trusted proxy boundary; the /64 prefix
used for abuse hashing is never the GeoIP input. Only a regional category and
release metadata leave this feature. It creates no address/country records and
makes no external lookup. IP country is approximate, including VPN exits, and is
not precise location or legal residence. EEA30, UK, Switzerland and the listed EU
outermost/Åland codes use the consent-required policy. Unmapped or unrecognized
countries stay unknown. This configured policy does not certify every country's
privacy requirements.

## Manual monthly refresh

1. Download the new monthly **MMDB gzip**, preserving the original archive. Check
   its extracted MD5 and SHA1 against the official release page. Compute SHA-256
   for both the archive and decompressed bytes locally, and record byte sizes and
   the MMDB build time/type. Do not substitute the CSV or a city database.
2. Replace the archive under `apps/website/be-01/src/assets/country/`. Update
   `release.json` with the release month, filename, identities, byte sizes,
   build time and provider checksums. Update the dated release in `NOTICE.txt`,
   retaining the source, attribution, licence and truthful modification statement.
   Do not edit the MMDB bytes. The reader dependency remains pinned in the root
   `package.json`, Bun lockfile and API portability package metadata.
3. Update the literal real-dataset tests and package month expectation for the new
   release, retaining IPv4, full IPv6, unmapped and startup-refusal coverage. Update
   the dataset month stated in the private site's `apps/website/site/src/pages/privacy.astro`
   and its relevant assertion in `apps/website/site/src/content/privacy-launch.test.ts`
   to match the installed release. Keep `privacyEffectiveDate = null` for the
   development preview; the policy effective date and production publication
   remain owner-controlled. Run
   `bunx nx run-many -t test lint typecheck build -p website-contracts website-be-01`
   and `bunx nx run website-be-01:test:package`. The package smoke starts the real
   compiled main, exercises regional decisions, then removes its actual archive
   and requires startup failure. Retain causal R5 proof evidence in the change's
   `verify.md`; include the current host's required gate before claiming release.
4. Confirm the frontend output has no country archive. Follow the existing private
   snapshot process to mirror the canonical runtime and dependency, then verify
   its own packaging. Keep publication within the owner's release authorization.
5. Move the prominent next-download reminder to the following month's first day.
   Review metadata from `GET /analytics/region`: `database.month` is the installed
   release, `refreshDue` is the following month's first UTC date, and `updateDue`
   becomes true at that midnight. An overdue release remains overdue until a
   verified replacement is installed; it never claims to have refreshed itself.

Programmatic API instances may omit the reader and explicitly return
`{ "region": "unknown", "database": null }`. Actual source and compiled main always
load the configured packaged archive; missing/unreadable, identity mismatch,
malformed data and wrong database kind refuse startup. Readers and browser code
must preserve unknown as a conservative default.
