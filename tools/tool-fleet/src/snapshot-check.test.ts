import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parseAllDocuments } from 'yaml';

describe('shipped SLM freshness validator', () => {
  for (const [name, response, curlExit, expected] of [
    ['fresh', '{"puni-daily":{"last_success":{"time":1999999000000}}}', 0, 0],
    ['stale', '{"puni-daily":{"last_success":{"time":1900000000000}}}', 0, 1],
    ['future', '{"puni-daily":{"last_success":{"time":2000001000000}}}', 0, 1],
    ['missing', '{}', 0, 1],
    ['malformed', '{"puni-daily":{"last_success":{"time":"yesterday"}}}', 0, 1],
    ['request failure', '', 22, 22],
  ] as const) {
    it(`rejects or accepts ${name} on the production script path`, async () => {
      const documents = parseAllDocuments(
        await readFile(
          join(import.meta.dir, '../../../infra/platform/backup/elastic/snapshots.yaml'),
          'utf8',
        ),
      );
      const settings = documents[0]?.getIn(['data', 'check.sh']);
      expect(typeof settings).toBe('string');
      const directory = await mkdtemp(join(tmpdir(), 'slm-proof-'));
      try {
        await writeFile(join(directory, 'check.sh'), String(settings));
        await writeFile(
          join(directory, 'curl'),
          '#!/bin/bash\nprintf "%s" "$SLM_RESPONSE"\nexit "$SLM_CURL_EXIT"\n',
        );
        await writeFile(join(directory, 'date'), '#!/bin/bash\necho 2000000000\n');
        await chmod(join(directory, 'curl'), 0o755);
        await chmod(join(directory, 'date'), 0o755);
        const process = Bun.spawn(['/bin/bash', join(directory, 'check.sh')], {
          env: {
            ...Bun.env,
            PATH: `${directory}:/usr/bin:/bin`,
            ELASTIC_PASSWORD: 'fixture',
            SLM_RESPONSE: response,
            SLM_CURL_EXIT: String(curlExit),
          },
          stdout: 'pipe',
          stderr: 'pipe',
        });
        await Promise.all([
          new Response(process.stdout).text(),
          new Response(process.stderr).text(),
        ]);
        expect(await process.exited).toBe(expected);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
