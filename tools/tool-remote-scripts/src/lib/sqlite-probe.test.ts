import { chmod, mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { checkBackendRecovery } from '../swap';
import { ROOT, storedRelationshipTypesCommand } from './docker';
import { storedSnapshotCommand } from './sqlite-probe';

for (const mode of ['clean', 'wal', 'wal-and-shm'] as const) {
  const retainedWal = mode !== 'clean';
  test(`production stored relationships probe preserves source with ${mode}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'stored-probe-'));
    const path = join(root, 'wbs.db');
    try {
      const sqlite = new Database(path, { create: true });
      sqlite.run('PRAGMA journal_mode=WAL; CREATE TABLE typed_dependency(type TEXT);');
      sqlite.close();
      if (retainedWal) {
        const child = Bun.spawn(
          [
            'bun',
            '-e',
            `import { Database } from 'bun:sqlite'; const db = new Database(process.env.DB_PATH); db.run("INSERT INTO typed_dependency VALUES ('SS')"); process.kill(process.pid, 'SIGKILL');`,
          ],
          { env: { ...process.env, DB_PATH: path }, stderr: 'pipe', stdout: 'pipe' },
        );
        await child.exited;
        expect(await readdir(root)).toContain('wbs.db-wal');
      }
      if (mode === 'wal') await rm(`${path}-shm`);
      await chmod(root, 0o555);
      const before = new Map(
        await Promise.all(
          (await readdir(root)).map(
            async (name) => [name, await readFile(join(root, name))] as const,
          ),
        ),
      );
      const command = storedSnapshotCommand(storedRelationshipTypesCommand('probe').slice(2));
      const child = Bun.spawn(command, {
        env: { ...process.env, DB_PATH: path },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      expect({ exit: await child.exited, stderr }).toEqual({ exit: 0, stderr: '' });
      expect(JSON.parse(stdout)).toEqual(retainedWal ? [{ type: 'SS', count: 1 }] : []);
      const image = `registry/wbs-be-01@sha256:${'c'.repeat(64)}`;
      await checkBackendRecovery(
        image,
        image,
        '/data/wbs.db',
        async (args) => {
          if (args[0] === 'ps') return '';
          if (!args.some((argument) => argument.includes("from 'bun:sqlite'"))) return '["SS"]';
          if (!args.some((argument) => argument.includes('typed_dependency GROUP BY type')))
            return '[]';
          expect(args).toContain(`type=bind,source=${ROOT}/data,target=/data,readonly`);
          const entrypoint = args.indexOf('--entrypoint');
          const executable = args.at(entrypoint + 1);
          expect(executable).toBe('bun');
          const probe = Bun.spawn(['bun', ...args.slice(entrypoint + 3)], {
            env: { ...process.env, DB_PATH: path },
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const output = await new Response(probe.stdout).text();
          const failure = await new Response(probe.stderr).text();
          if ((await probe.exited) !== 0) throw new Error(failure);
          return output;
        },
        (host) => realpath(host.replace(`${ROOT}/data`, root)),
      );
      expect((await readdir(root)).sort()).toEqual([...before.keys()].sort());
      for (const [name, bytes] of before) expect(await readFile(join(root, name))).toEqual(bytes);
    } finally {
      await chmod(root, 0o700);
      await rm(root, { recursive: true });
    }
  });
}

for (const fault of ['absent-main', 'unreadable-main', 'unreadable-wal'] as const) {
  test(`stored snapshot refuses required source failure: ${fault}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'stored-probe-refusal-'));
    const path = join(root, 'wbs.db');
    try {
      const sqlite = new Database(path, { create: true });
      sqlite.run('CREATE TABLE typed_dependency(type TEXT)');
      sqlite.close();
      if (fault === 'absent-main') await rm(path);
      if (fault === 'unreadable-main') await chmod(path, 0o000);
      if (fault === 'unreadable-wal') {
        await Bun.write(`${path}-wal`, 'inaccessible');
        await chmod(`${path}-wal`, 0o000);
      }
      const child = Bun.spawn(
        storedSnapshotCommand(storedRelationshipTypesCommand('probe').slice(2)),
        { env: { ...process.env, DB_PATH: path }, stdout: 'pipe', stderr: 'pipe' },
      );
      const stderr = await new Response(child.stderr).text();
      expect(await child.exited).not.toBe(0);
      expect(stderr).toContain(fault === 'absent-main' ? 'ENOENT' : 'EACCES');
    } finally {
      await rm(root, { recursive: true });
    }
  });
}
