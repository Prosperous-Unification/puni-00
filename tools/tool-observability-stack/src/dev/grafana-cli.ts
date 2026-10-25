import { randomUUID } from 'node:crypto';
import { open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  applyGrafana,
  captureGrafana,
  createGrafanaClient,
  type GrafanaJournal,
  parseGrafanaJournal,
  rollbackGrafana,
} from './grafana';

/**
 * Serializes this operator's API integration using an exclusive lock beside the durable receipt.
 * Never replaces an existing capture. Interrupted lock/unknown remote mutation requires manual
 * reconciliation; removing a stale lock is an explicit operator action after proving no process owns it.
 */
export async function runGrafanaCli(args: string[], environment = process.env): Promise<void> {
  const [operation, receiptPath] = args;
  // Proof: invalid-operation CLI negative fails when this guard is removed.
  if (args.length !== 2 || !['capture', 'apply', 'rollback'].includes(operation))
    throw new Error('usage: grafana-cli.ts <capture|apply|rollback> <journal.json>');
  const endpoint = environment['GRAFANA_URL'];
  const authorization = environment['GRAFANA_AUTHORIZATION'];
  // Proof: missing-environment CLI negative fails when this guard is removed.
  if (endpoint === undefined || authorization === undefined)
    throw new Error('GRAFANA_URL and in-memory GRAFANA_AUTHORIZATION are required');
  const api = createGrafanaClient(endpoint, authorization);
  const path = resolve(receiptPath);
  const lockPath = `${path}.lock`;
  // Proof: occupied-lock CLI negative observes EEXIST without API mutation.
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    await lock.writeFile(`${String(process.pid)}\n`);
    await lock.sync();
    const saveJournal = async (journal: GrafanaJournal) => {
      const pendingPath = `${path}.${randomUUID()}.pending`;
      const pending = await open(pendingPath, 'wx', 0o600);
      try {
        await pending.writeFile(`${JSON.stringify(journal)}\n`);
        await pending.sync();
      } finally {
        await pending.close();
      }
      await rename(pendingPath, path);
      const directory = await open(dirname(path), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    };
    if (operation === 'capture') {
      const journal = await captureGrafana(api);
      // Proof: existing-capture CLI negative observes EEXIST and preserves prior bytes.
      const receipt = await open(path, 'wx', 0o600);
      try {
        await receipt.writeFile(`${JSON.stringify(journal)}\n`);
        await receipt.sync();
      } finally {
        await receipt.close();
      }
      const directory = await open(dirname(path), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } else {
      const metadata = await stat(path);
      // Proof: unreadable-journal CLI negative fails even with privileged filesystem access.
      if ((metadata.mode & 0o444) === 0) throw new Error('unreadable Grafana journal');
      const journal = parseGrafanaJournal(JSON.parse(await readFile(path, 'utf8')));
      if (operation === 'apply') await applyGrafana(api, journal, saveJournal);
      else await rollbackGrafana(api, journal, saveJournal);
    }
    console.log(JSON.stringify({ operation, journal: path, status: 'complete' }));
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (import.meta.main) await runGrafanaCli(process.argv.slice(2));
