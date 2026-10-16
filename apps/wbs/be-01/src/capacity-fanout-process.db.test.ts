import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { openDatabase } from './repository/db';
import { runMigrations } from './repository/migrate';

it('replays committed capacity fanout after killing its writer before push', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'capacity-crash-'));
  const databasePath = join(directory, 'capacity.sqlite');
  runMigrations(databasePath, new URL('../drizzle', import.meta.url).pathname);
  const sqlite = openDatabase(databasePath);
  const children: ReturnType<typeof Bun.spawn>[] = [];
  const launch = (role: string) => {
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./testing/capacity-fanout-process.ts', import.meta.url).pathname,
        role,
        databasePath,
        directory,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    children.push(child);
    return child;
  };
  try {
    const writer = launch('writer');
    const markerPath = join(directory, 'committed.json');
    const stagedPath = join(directory, `.committed-${String(writer.pid)}.pending`);
    const marker = Bun.file(markerPath);
    const waitFor = async (published: () => Promise<boolean>, phase: string, budgetMs = 15_000) => {
      const deadline = Date.now() + budgetMs;
      while (!(await published())) {
        if (writer.exitCode !== null || Date.now() > deadline) {
          if (writer.exitCode === null) writer.kill('SIGKILL');
          await writer.exited;
          throw new Error(
            `writer did not reach ${phase}: ${await new Response(writer.stderr).text()}`,
          );
        }
        await Bun.sleep(1);
      }
    };
    await waitFor(
      async () => (await Bun.file(stagedPath).exists()) || (await Bun.file(markerPath).exists()),
      'marker staging',
    );
    // Proof: direct publication exposed committed.json before release; omitting
    // rename never published it (watched child-path faults, 2026-10-16).
    expect(await Bun.file(markerPath).exists()).toBe(false);
    writeFileSync(join(directory, 'release-marker'), '');
    await waitFor(() => Bun.file(markerPath).exists(), 'atomic marker publication', 3_000);
    const published = statSync(markerPath, { bigint: true });
    await waitFor(() => Bun.file(join(directory, 'retried')).exists(), 'transport retry');
    // Proof: removing the one-shot publication guard replaced the marker inode
    // on the actual PushClient retry (watched child-path fault, 2026-10-16).
    expect(statSync(markerPath, { bigint: true }).ino).toBe(published.ino);
    expect(statSync(markerPath, { bigint: true }).mtimeNs).toBe(published.mtimeNs);
    expect(await Bun.file(stagedPath).exists()).toBe(false);
    expect(JSON.parse(await marker.text())).toEqual({ pid: writer.pid, cursor: -1 });
    expect(writer.exitCode).toBeNull();
    expect(writer.pid).not.toBe(process.pid);
    expect(sqlite.query('SELECT realistic FROM estimate WHERE work_item_id = ?').get('A')).toEqual({
      realistic: 3,
    });
    const durable = sqlite
      .query<{ seq: number; message: string }, []>(
        "SELECT seq, message FROM event_log WHERE subscription = 'project:B' ORDER BY seq",
      )
      .all();
    // Proof: skipping recipient recording or the installed live-plan binding lost B;
    // reinserting in pushRecorded added seq 1 (watched production faults, 2026-10-16).
    expect(
      durable.map(({ seq, message }) => ({ seq, message: JSON.parse(message) as unknown })),
    ).toEqual([
      { seq: 0, message: { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' } },
    ]);
    writer.kill('SIGKILL');
    await writer.exited;
    expect(writer.signalCode).toBe('SIGKILL');
    const reader = launch('reader');
    expect(reader.pid).not.toBe(writer.pid);
    expect(reader.pid).not.toBe(process.pid);
    const deadlineTimer = setTimeout(() => {
      reader.kill('SIGKILL');
    }, 15_000);
    const exit = await reader.exited;
    clearTimeout(deadlineTimer);
    const errors = await new Response(reader.stderr).text();
    expect({ exit, errors }).toEqual({ exit: 0, errors: '' });
    const observed: unknown = JSON.parse(readFileSync(join(directory, 'read.json'), 'utf8'));
    // Proof: memory-only replay denied the retained range; ignoring Fast shared input
    // placed B at [0,1) without its holder; bypassed membership replayed to both
    // foreign and removed principals (watched production faults, 2026-10-16).
    expect(observed).toEqual({
      pid: reader.pid,
      emptyBuffer: true,
      resume: {
        'project:B': {
          status: 'replaying',
          events: [
            { seq: 0, message: { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' } },
          ],
        },
      },
      repeated: { 'project:B': { status: 'replaying', events: [] } },
      slice: {
        start: 3,
        end: 4,
        personId: 'ana',
        boundBy: 'elsewhere',
        elsewhereHolder: { projectId: 'A', workItemId: 'A' },
      },
      waitingElsewhere: 1,
      foreign: { 'project:B': { status: 'denied', reason: 'forbidden' } },
      removed: { 'project:B': { status: 'denied', reason: 'forbidden' } },
      unchanged: true,
    });
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill('SIGKILL');
      await child.exited;
    }
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 45_000);
