import { existsSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

import { expect, test } from 'bun:test';

import { openDatabase } from './db';
import {
  acquireIsolatedStoreUse,
  assertIsolatedStore,
  createIsolatedStore,
} from './isolated-store';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

async function refusalOf(pending: Promise<void>): Promise<Error> {
  let refusal: unknown;
  try {
    await pending;
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw Error('expected asynchronous refusal absent');
  return refusal;
}

test('keeps actual SQLite users closed before removal and permits repeated opens during the owner lifetime', async () => {
  const owner = createIsolatedStore();
  assertIsolatedStore(owner, owner.path);
  const database = openDatabase(owner.path);
  const selected = database.close.bind(database, true);
  let calls = 0;
  const use = acquireIsolatedStoreUse(owner, owner.path, () => {
    calls++;
    selected();
  });
  database.run('CREATE TABLE witness(value TEXT NOT NULL)');
  database.run("INSERT INTO witness VALUES('retained')");
  expect((await refusalOf(owner.close())).message).toContain('active users');
  await Promise.all([use.close(), use.close()]);
  expect(calls).toBe(1);
  expect(() => database.query('SELECT * FROM witness')).toThrow(/closed/i);
  assertIsolatedStore(owner, owner.path);
  const reopened = openDatabase(owner.path);
  const reopenedUse = acquireIsolatedStoreUse(
    owner,
    owner.path,
    reopened.close.bind(reopened, true),
  );
  try {
    expect(reopened.query<{ value: string }, []>('SELECT value FROM witness').get()?.value).toBe(
      'retained',
    );
  } finally {
    await reopenedUse.close();
    await owner.close();
  }
  expect(existsSync(dirname(owner.path))).toBe(false);
});

test('captures the actual bound source close before later property substitution', async () => {
  const owner = createIsolatedStore();
  const source = openSqliteSource({
    dbPath: owner.path,
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
  });
  const selected = source.close.bind(source);
  let calls = 0;
  const use = acquireIsolatedStoreUse(owner, owner.path, () => {
    calls++;
    return selected();
  });
  source.close = () => {
    throw Error('later close must not be selected');
  };
  expect((await refusalOf(owner.close())).message).toContain('active users');
  await Promise.all([use.close(), use.close()]);
  expect(calls).toBe(1);
  try {
    let refusal: unknown;
    try {
      source.db.run('CREATE TABLE after_close(value TEXT)');
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toBeInstanceOf(Error);
    if (!(refusal instanceof Error)) throw Error('closed source query refusal absent');
    expect(refusal.message).toContain('Failed query');
    expect(refusal.cause).toBeInstanceOf(Error);
    if (!(refusal.cause instanceof Error)) throw Error('closed source native cause absent');
    expect(refusal.cause.message).toMatch(/closed/i);
  } finally {
    await owner.close();
  }
  expect(existsSync(dirname(owner.path))).toBe(false);
});

test('a failed selected close remains outstanding after genuine SQLite closure and cannot be replaced', () => {
  const script = `
    import {createIsolatedStore,acquireIsolatedStoreUse,assertIsolatedStore} from ${JSON.stringify(new URL('./isolated-store.ts', import.meta.url).pathname)};
    import {openDatabase} from ${JSON.stringify(new URL('./db.ts', import.meta.url).pathname)};
    const owner=createIsolatedStore();
    console.log(JSON.stringify({path:owner.path}));
    const database=openDatabase(owner.path);
    const selected=database.close.bind(database,true);
    let calls=0;
    const use=acquireIsolatedStoreUse(owner,owner.path,()=>{calls++;selected();throw Error('selected close failed after actual SQLite close');});
    const first=use.close();
    if(use.close()!==first)throw Error('close settlement not memoized');
    let failed=false;try{await first;}catch(cause){if(!(cause instanceof Error)||cause.message!=='selected close failed after actual SQLite close')throw cause;failed=true;}
    if(!failed||calls!==1)throw Error('actual selected close did not fail exactly once');
    let refused=false;try{await owner.close();}catch(cause){if(!(cause instanceof Error)||!cause.message.includes('active users'))throw cause;refused=true;}
    if(!refused)throw Error('failed user close allowed removal');
    assertIsolatedStore(owner,owner.path);
    console.log(JSON.stringify({calls,refused,failed}));
  `;
  const child = Bun.spawnSync([process.execPath, '--eval', script], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  const nativeReceipt = {
    exitCode: child.exitCode,
    success: child.success,
    signalField: child.signalCode ?? 'absent',
    timeoutField: child.exitedDueToTimeout ?? 'absent',
    stdout: new TextDecoder().decode(child.stdout),
    stderr: new TextDecoder().decode(child.stderr),
  };
  console.log('isolated-store child receipt ' + JSON.stringify(nativeReceipt));
  const lines = nativeReceipt.stdout.trim().split('\n');
  const publication: unknown = JSON.parse(lines[0] ?? 'null');
  if (
    typeof publication !== 'object' ||
    publication === null ||
    !('path' in publication) ||
    typeof publication.path !== 'string'
  )
    throw Error('owned child path publication absent');
  try {
    expect({
      exit: child.exitCode,
      success: child.success,
      signal: child.signalCode,
      stderr: new TextDecoder().decode(child.stderr),
    }).toEqual({ exit: 0, success: true, signal: undefined, stderr: '' });
    expect(lines[1]).toBe('{"calls":1,"refused":true,"failed":true}');
    expect(existsSync(publication.path)).toBe(true);
  } finally {
    unlinkSync(publication.path);
    rmdirSync(dirname(publication.path));
  }
});
