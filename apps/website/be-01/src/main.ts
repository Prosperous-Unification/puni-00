import { S3JournalRemote } from '@website/store-sqlite';

import { describeAlertWebhook } from './guardrail-alerts';
import { readRetentionJournalSetting, readWebsiteApiConfig } from './runtime-config';
import { createWebsiteApi } from './server';

const portText = process.env['WEBSITE_API_PORT'] ?? '3101';
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('WEBSITE_API_PORT must be a TCP port');
const journal = readRetentionJournalSetting(process.env);
const config = readWebsiteApiConfig(process.env);
const api = createWebsiteApi({
  ...config,
  retentionJournal:
    journal.mode === 's3'
      ? {
          remote: new S3JournalRemote(journal.s3),
          options: {
            journalId: journal.journalId,
            writer: {
              release: journal.release,
              privateRevision: journal.privateRevision,
              process: 'api',
            },
            now: Date.now,
          },
        }
      : undefined,
});
// Startup replay precedes serving: a journal that cannot be read and verified stops the process (veto V3).
await api.openRetentionJournal();

Bun.serve({
  hostname: config.apiBindHost,
  port,
  maxRequestBodySize: 12_000,
  fetch: (request, server) => api.fetch(request, server.requestIP(request)?.address),
});
console.info(`Website API listening on port ${String(port)}`);
console.info(describeAlertWebhook(config.guardrailWebhookUrl));
console.info(`retention journal: ${journal.mode}`);
