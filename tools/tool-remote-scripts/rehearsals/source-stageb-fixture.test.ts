import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { dlopen, ptr, read as ffiRead } from 'bun:ffi';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import {
  decodeSourceMigrationFrames,
  encodeSourceMigrationFrame,
  type SourceMigrationPackage,
  type SourceMigrationPermit,
} from './source-stageb-migration-worker';

test('migration framing preserves closed canonical bodies and rejects extra fields and truncation', () => {
  const ready = { version: 1, nonce: 'a'.repeat(32), environment: 'prod', phase: 'ready' } as const;
  const frame = encodeSourceMigrationFrame(ready);
  expect(decodeSourceMigrationFrames(frame)).toEqual([ready]);
  expect(() => decodeSourceMigrationFrames(frame.subarray(0, frame.length - 1))).toThrow();
  expect(() => encodeSourceMigrationFrame({ ...ready, extra: true } as typeof ready)).toThrow();
  const alternate = Buffer.from(JSON.stringify(ready) + '\n');
  const encoded = Buffer.alloc(alternate.length + 4);
  encoded.writeUInt32BE(alternate.length);
  alternate.copy(encoded, 4);
  expect(() => decodeSourceMigrationFrames(encoded)).toThrow();
});
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(
  boundary:
    | 'ordinary'
    | 'delay-envelope'
    | 'drop-ledger'
    | 'manifest-drift'
    | 'manifest-type'
    | 'oversize-manifest' = 'ordinary',
) {
  const root = mkdtempSync('/tmp/puni-worker-owned-');
  chmodSync(root, 0o700);
  const envelope = join(root, 'envelope');
  const drizzle = join(envelope, 'drizzle');
  mkdirSync(drizzle, { recursive: true, mode: 0o700 });
  const names = [
    '20261022211000_add_external_dependencies',
    '20261022212000_add_cross_project_dependency_activation',
  ];
  const migrations = names.map((name, index) => {
    const folder = join(drizzle, name);
    mkdirSync(folder, { mode: 0o700 });
    const sql =
      index === 0
        ? "CREATE TABLE worker_sentinel(value TEXT);\n--> statement-breakpoint\nINSERT INTO worker_sentinel VALUES ('permitted');\n"
        : 'CREATE TABLE worker_authority(active INTEGER);\n--> statement-breakpoint\nINSERT INTO worker_authority VALUES (0);\n';
    const down = `DROP TABLE ${index === 0 ? 'worker_sentinel' : 'worker_authority'};\n`;
    writeFileSync(join(folder, 'migration.sql'), sql);
    writeFileSync(join(folder, 'down.sql'), down);
    return {
      name,
      migration: { size: Buffer.byteLength(sql), sha256: hash(sql) },
      down: { size: Buffer.byteLength(down), sha256: hash(down) },
      snapshot: null,
    };
  });
  const manifest =
    JSON.stringify({
      format: 'dependency-migration-artifact',
      version: 1,
      sourceSha: 'a'.repeat(40),
      candidateImage: `registry/wbs-be-01@sha256:${'b'.repeat(64)}`,
      candidateImageId: `sha256:${'c'.repeat(64)}`,
      migrations,
    }) + '\n';
  writeFileSync(join(envelope, 'manifest.json'), manifest);
  const fixed: SourceMigrationPackage = {
    version: 1,
    sourceSha: 'a'.repeat(40),
    workflowSha: 'b'.repeat(40),
    nonce: 'c'.repeat(32),
    migrationManifestSha256: hash(manifest),
    envelope,
    databases: [
      { environment: 'prod', path: join(root, 'prod.sqlite') },
      { environment: 'dev', path: join(root, 'dev.sqlite') },
    ],
  };
  writeFileSync(fixed.databases[0].path, '');
  writeFileSync(fixed.databases[1].path, '');
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, 'source-stageb-migration-worker.ts')],
    target: 'bun',
    format: 'esm',
    splitting: false,
    sourcemap: 'external',
    define: { SOURCE_STAGEB_MIGRATION_LITERAL: JSON.stringify(JSON.stringify(fixed)) },
    plugins:
      boundary === 'ordinary'
        ? []
        : [
            {
              name: 'owned-worker-native-boundary-fault',
              setup(build) {
                if (boundary !== 'drop-ledger') {
                  build.onLoad({ filter: /source-stageb-migration-worker\.ts$/ }, async (args) => ({
                    loader: 'ts',
                    contents: (await Bun.file(args.path).text()).replace(
                      "from 'node:fs'",
                      "from 'stageb:owned-fs'",
                    ),
                  }));
                  build.onResolve({ filter: /^stageb:owned-fs$/ }, () => ({
                    path: 'fs-delay',
                    namespace: 'owned-native-fault',
                  }));
                  build.onResolve({ filter: /^stageb:actual-fs$/ }, () => ({
                    path: 'node:fs',
                    external: true,
                  }));
                  build.onLoad({ filter: /.*/, namespace: 'owned-native-fault' }, () => ({
                    loader: 'js',
                    contents: `import * as actual from 'node:fs';export const {constants,closeSync,lstatSync,openSync,readdirSync,writeSync}=actual;let manifests=0;let stats=0;const boundary=${JSON.stringify(boundary)};function manifest(file){return typeof file==='number'&&actual.readlinkSync('/proc/self/fd/'+file).endsWith('/manifest.json');}export function fstatSync(file,...args){const observed=actual.fstatSync(file,...args);if(manifest(file)){stats++;if(boundary==='manifest-type')return Object.assign(Object.create(Object.getPrototypeOf(observed)),observed,{isFile:()=>false});if(boundary==='manifest-drift'&&stats%2===0)return Object.assign(Object.create(Object.getPrototypeOf(observed)),observed,{mtimeMs:observed.mtimeMs+1});}return observed;}export function readFileSync(file,...args){if(manifest(file)){if(boundary==='delay-envelope'&&++manifests===2)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);if(boundary==='oversize-manifest')process.exit(71);}return actual.readFileSync(file,...args);}`,
                  }));
                } else {
                  build.onLoad({ filter: /store-sqlite\/src\/db\.ts$/ }, async (args) => ({
                    loader: 'ts',
                    contents: (await Bun.file(args.path).text()).replace(
                      "from 'bun:sqlite'",
                      "from 'stageb:owned-sqlite'",
                    ),
                  }));
                  build.onResolve({ filter: /^stageb:owned-sqlite$/ }, () => ({
                    path: 'sqlite-ledger',
                    namespace: 'owned-native-fault',
                  }));
                  build.onResolve({ filter: /^stageb:actual-sqlite$/ }, () => ({
                    path: 'bun:sqlite',
                    external: true,
                  }));
                  build.onLoad({ filter: /.*/, namespace: 'owned-native-fault' }, () => ({
                    loader: 'js',
                    contents: `import {Database as ActualDatabase,SQLiteError} from 'bun:sqlite';export {SQLiteError};let altered=false;export class Database extends ActualDatabase{constructor(path,options){super(path,options);const client=this;const close=client.close.bind(client);client.close=(...args)=>{close(...args);if(options?.readwrite===true&&!altered){altered=true;const db=new ActualDatabase(path,{readwrite:true});try{db.run("DELETE FROM __drizzle_migrations WHERE name='20261022211000_add_external_dependencies'");}finally{db.close();}}};}}`,
                  }));
                }
              },
            },
          ],
  });
  if (!built.success) throw new AggregateError(built.logs, 'fixed worker build failed');
  const worker = join(root, 'migration-worker.mjs');
  const output = built.outputs.find((artifact) => artifact.kind === 'entry-point');
  if (!output) throw new Error('worker output absent');
  writeFileSync(worker, new Uint8Array(await output.arrayBuffer()), { mode: 0o500 });
  const runtime = join(root, 'bun');
  writeFileSync(runtime, readFileSync(process.execPath), { mode: 0o500 });
  function spawn(
    environment: 'prod' | 'dev',
    fault:
      | 'ordinary'
      | 'extra-argv'
      | 'missing-argv'
      | 'environment'
      | 'extra-environment'
      | 'copy-directory' = 'ordinary',
  ) {
    const cwd = join(root, `migration-${environment}`);
    mkdirSync(cwd, { mode: 0o700 });
    mkdirSync(join(cwd, 'copy'), { mode: 0o700 });
    mkdirSync(join(cwd, 'sqlite'), { mode: 0o700 });
    const argv = [runtime, '--no-env-file', 'run', worker, environment];
    if (fault === 'extra-argv') argv.push('unexpected');
    if (fault === 'missing-argv') argv.pop();
    const childEnvironment: Record<string, string> = {
      WBS_ENV: environment,
      TMPDIR: join(cwd, 'copy'),
      SQLITE_TMPDIR: join(cwd, 'sqlite'),
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
      LANG: 'C.UTF-8',
      TZ: 'UTC',
    };
    if (fault === 'environment')
      childEnvironment['WBS_ENV'] = environment === 'prod' ? 'dev' : 'prod';
    if (fault === 'extra-environment') childEnvironment['UNEXPECTED_ENV'] = 'rejected';
    if (fault === 'copy-directory') childEnvironment['TMPDIR'] = join(cwd, 'sqlite');
    return Bun.spawn(argv, {
      cwd,
      env: childEnvironment,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }
  const permit: SourceMigrationPermit = {
    version: 1,
    nonce: fixed.nonce,
    environment: 'prod',
    phase: 'migrate',
    sourceSha: fixed.sourceSha,
    workflowSha: fixed.workflowSha,
    inputManifestSha256: 'd'.repeat(64),
    migrationManifestSha256: fixed.migrationManifestSha256,
    remainingMs: 120000,
    notAfter: Date.now() + 120000,
  };
  return {
    root,
    fixed,
    spawn,
    permit,
    expectedApplied: migrations.map((row) => ({ name: row.name, hash: row.migration.sha256 })),
  };
}
async function ready(reader: ReadableStreamDefaultReader<Uint8Array>, stderr?: Promise<string>) {
  const first = await reader.read();
  if (first.done)
    throw new Error(
      'worker ended before ready' + (stderr === undefined ? '' : ': ' + (await stderr)),
    );
  expect(decodeSourceMigrationFrames(first.value)[0]?.phase).toBe('ready');
  return first.value;
}

test('fixed real worker waits without opening SQLite, then migrates both fixed stores and settles scratch', async () => {
  const owned = await fixture();
  try {
    for (const environment of ['prod', 'dev'] as const) {
      const observedOpens = observeDatabaseOpens(
        owned.fixed.databases[environment === 'prod' ? 0 : 1].path,
      );
      const child = owned.spawn(environment);
      const reader = child.stdout.getReader();
      const stderr = new Response(child.stderr).text();
      try {
        await ready(reader, stderr);
        const initialActivity = observedOpens.drain();
        // The original live child's descriptor table is a real DB-open oracle, beyond file size.
        const descriptors = readdirSync(`/proc/${String(child.pid)}/fd`);
        const links = descriptors.map((name) =>
          readlinkSync(`/proc/${String(child.pid)}/fd/${name}`),
        );
        expect(links.some((link) => link.includes('.sqlite'))).toBe(false);
        await child.stdin.write(encodeSourceMigrationFrame({ ...owned.permit, environment }));
        await child.stdin.flush();
        await Bun.sleep(25);
        const heldActivity = observedOpens.drain();
        observedOpens.close();
        const probe = new Database(owned.fixed.databases[environment === 'prod' ? 0 : 1].path, {
          readonly: true,
        });
        try {
          expect(
            probe.query("SELECT name FROM sqlite_master WHERE name='worker_sentinel'").all(),
          ).toEqual([]);
        } finally {
          probe.close();
        }
        expect({ initialActivity, heldActivity }).toEqual({
          initialActivity: [],
          heldActivity: [],
        });
        const held = new Database(owned.fixed.databases[environment === 'prod' ? 0 : 1].path, {
          readonly: true,
        });
        try {
          expect(
            held.query("SELECT name FROM sqlite_master WHERE name='worker_sentinel'").all(),
          ).toEqual([]);
        } finally {
          held.close();
        }
        await child.stdin.end();
        const terminal = await reader.read();
        if (terminal.done) throw new Error('terminal absent');
        expect(decodeSourceMigrationFrames(terminal.value)[0]?.phase).toBe('complete');
        expect((await reader.read()).done).toBe(true);
        expect(await child.exited).toBe(0);
        expect(await stderr).toBe('');
        const db = new Database(owned.fixed.databases[environment === 'prod' ? 0 : 1].path, {
          readonly: true,
        });
        try {
          expect(db.query('SELECT value FROM worker_sentinel').all()).toEqual([
            { value: 'permitted' },
          ]);
          expect(db.query('SELECT active FROM worker_authority').all()).toEqual([{ active: 0 }]);
          expect(
            db.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all(),
          ).toEqual(owned.expectedApplied);
        } finally {
          db.close();
        }
        expect(readdirSync(join(owned.root, `migration-${environment}`, 'copy'))).toEqual([]);
        expect(readdirSync(join(owned.root, `migration-${environment}`, 'sqlite'))).toEqual([]);
      } finally {
        observedOpens.close();
        await child.stdin.end();
        if (child.exitCode === null) child.kill();
        await child.exited;
        reader.releaseLock();
        await stderr;
      }
    }
  } finally {
    rmSync(owned.root, { recursive: true });
  }
}, 30000);

for (const fault of [
  'duplicate',
  'trailing',
  'missing',
  'nonce',
  'source',
  'workflow',
  'manifest',
  'expired',
  'conservative',
  'sql-tree',
] as const) {
  test(`fixed real worker refuses ${fault} before SQLite mutation`, async () => {
    const owned = await fixture();
    const child = owned.spawn('prod');
    const reader = child.stdout.getReader();
    const stderr = new Response(child.stderr).text();
    try {
      await ready(reader, stderr);
      let permit = owned.permit;
      if (fault === 'nonce') permit = { ...permit, nonce: 'e'.repeat(32) };
      if (fault === 'source') permit = { ...permit, sourceSha: 'e'.repeat(40) };
      if (fault === 'workflow') permit = { ...permit, workflowSha: 'e'.repeat(40) };
      if (fault === 'manifest') permit = { ...permit, migrationManifestSha256: 'e'.repeat(64) };
      if (fault === 'expired') permit = { ...permit, notAfter: Date.now() - 1 };
      if (fault === 'conservative') {
        await Bun.sleep(30);
        permit = { ...permit, remainingMs: 1 };
      }
      if (fault === 'sql-tree')
        writeFileSync(
          join(
            owned.fixed.envelope,
            'drizzle',
            '20261022211000_add_external_dependencies',
            'migration.sql',
          ),
          'CREATE TABLE foreign_sql_effect(value TEXT);\n',
        );
      const grant = encodeSourceMigrationFrame(permit);
      if (fault !== 'missing')
        await child.stdin.write(
          fault === 'duplicate'
            ? Buffer.concat([grant, grant])
            : fault === 'trailing'
              ? Buffer.concat([grant, Buffer.from([0])])
              : grant,
        );
      await child.stdin.end();
      const terminal = await reader.read();
      if (terminal.done) throw new Error('terminal absent');
      expect(decodeSourceMigrationFrames(terminal.value)[0]).toMatchObject({
        phase: 'failed',
        reason:
          fault === 'expired' || fault === 'conservative'
            ? 'deadline'
            : fault === 'sql-tree'
              ? 'migration'
              : 'permission-refused',
      });
      expect((await reader.read()).done).toBe(true);
      expect(await child.exited).toBe(1);
      expect(await stderr).toBe('');
      const probe = new Database(owned.fixed.databases[0].path, { readonly: true });
      try {
        expect(
          probe
            .query(
              "SELECT name FROM sqlite_master WHERE name IN ('worker_sentinel','foreign_sql_effect')",
            )
            .all(),
        ).toEqual([]);
      } finally {
        probe.close();
      }
    } finally {
      await child.stdin.end();
      if (child.exitCode === null) child.kill();
      await child.exited;
      reader.releaseLock();
      await stderr;
      rmSync(owned.root, { recursive: true });
    }
  }, 30000);
}

import { buildSourceFixtureMigrationWorker } from './source-stageb-fixture-bootstrap';
import {
  canonicalRetainedErrorSource,
  createConstructionFixture,
  runOwnedConstructionProbe,
} from './source-stageb-fixture-bootstrap.test';

test('actual original parent migration durably releases one held child and independently verifies dormant full ledger', async () => {
  const proposed = await createConstructionFixture();
  const control = proposed.directory + '/coordinator/source-stageb-constructor';
  const ownedPackage = {
    ...proposed.migrationPackage,
    envelope: control + '/envelope',
    databases: [
      { environment: 'prod' as const, path: control + '/data/production.sqlite' },
      { environment: 'dev' as const, path: control + '/data/development.sqlite' },
    ] as const,
  };
  const worker = await buildSourceFixtureMigrationWorker(ownedPackage);
  const facility = JSON.parse(proposed.facilityBytes.toString()) as SourceFixtureAuthority;
  facility.worker.bytes = worker.bytes.byteLength;
  facility.worker.sha256 = worker.sha256;
  proposed.facilityBytes = Buffer.from(JSON.stringify(facility) + '\n');
  proposed.worker = worker;
  const extra = `\nimport {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
import {Database} from 'bun:sqlite';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory,fault){
 const retention=retainOriginalStaging(inputs,artifacts,staging,journal);const construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);let evidence;
 try{
  const uid=process.geteuid();const gid=process.getegid();const parent=directory+'/coordinator/source-stageb-constructor';
  const control=await construction.acquireDirectory(parent,448,uid,gid);
  const envelope=await construction.acquireDirectory(parent+'/envelope',448,uid,gid);
  const staged=inspectOriginalStaging(retention).members;
  const migration=staged.filter(member=>member.path.startsWith('migration/')).map(member=>({...member,path:member.path.slice('migration/'.length),staged:member.path}));
  await construction.populateDirectory(envelope,migration);
  const data=await construction.acquireDirectory(parent+'/data',448,uid,gid);
  const job=await construction.acquireDirectory(parent+'/migration-prod',448,uid,gid);
  await construction.populateDirectory(job,[{path:'copy',kind:'directory',mode:448},{path:'sqlite',kind:'directory',mode:448}]);
  const bun=staged.find(member=>member.path==='solver/bun');if(!bun)throw Error('actual Bun staged member absent');
  const runtime=await construction.acquireFile(parent+'/bun',bun.bytes,bun.sha256,320,(offset,maximum)=>readOriginalStagedChunk(retention,bun.path,offset,maximum));
  const workerBytes=construction.policy.worker;
  const worker=await construction.acquireFile(parent+'/migration-worker.mjs',workerBytes.byteLength,construction.policy.facility.worker.sha256,320,async(offset,maximum)=>workerBytes.subarray(offset,offset+maximum));
  const database=await construction.acquireFile(parent+'/data/production.sqlite',0,hashBytes(''),384,async()=>Buffer.alloc(0));
  await construction.runMigration('prod',control,job,database,runtime,worker,envelope);
  const readonly=new Database(database.path,{readonly:true,create:false});let ledger,authority;
  try{ledger=readonly.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all();authority=readonly.query('SELECT id,state FROM cross_project_dependency_activation').all();}finally{readonly.close();}
  const snapshot=await inspectSourceJournal(journal);const operations=snapshot.records.map(record=>record.payload?.kind).filter(Boolean);
  const childReferences=construction.children.length;
  await construction.close();
  evidence={authority,ledgerRows:ledger.length,phase:snapshot.phase,childReferences,remaining:(await readdir(directory+'/coordinator')).filter(name=>name!=='source-stageb-staging'),joined:construction.children.every(child=>child.exitCode===0&&child.stdin.destroyed&&child.stdout.destroyed&&child.stderr.destroyed)};
 }finally{try{await construction.close();}finally{releaseOriginalStaging(retention);}}
 return evidence;
}`;
  const observed = await runOwnedConstructionProbe(proposed, extra);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(JSON.parse(observed.stdout)).toEqual({
    authority: [{ id: 1, state: 'DISABLED' }],
    ledgerRows: 2,
    phase: 'open',
    childReferences: 1,
    remaining: [],
    joined: true,
  });
}, 60000);

for (const fault of ['', 'unknown-output', 'symlink-output', 'replaced-parent'])
  test(`actual original setup output collector ${fault || 'bounded-residue'} reads owned filesystem and preserves foreign sentinels`, async () => {
    const proposed = await createConstructionFixture();
    const extra = `\nimport {SourceFixtureConstruction} from '${import.meta.dir}/source-stageb-fixture.ts';
import {mkdir,writeFile,rename,symlink,unlink,rmdir,lstat} from 'node:fs/promises';
import * as outputFs from 'node:fs/promises';import {spyOn} from 'bun:test';
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,archive,directory,fault){
 const retention=retainOriginalStaging(inputs,artifacts,staging,journal);const construction=new SourceFixtureConstruction(inputs,artifacts,journal,retention,archive);let evidence;let cleanupUnproved=false;
 try{
  const scope=await construction.acquireDirectory(directory+'/coordinator/output-owned',448,process.geteuid(),process.getegid());
  const entries=inspectOriginalStaging(retention).members.filter(member=>member.path==='source'||member.path.startsWith('source/')).map(member=>({...member,path:'src'+member.path.slice('source'.length),staged:member.path}));
  if(!entries.some(member=>member.path==='src/apps/wbs/mcp-01/src'))entries.push({path:'src/apps/wbs/mcp-01/src',kind:'directory',mode:493});
  entries.sort((left,right)=>(left.kind==='directory'?0:1)-(right.kind==='directory'?0:1)||(left.kind==='directory'?left.path.split('/').length-right.path.split('/').length:0)||left.path.localeCompare(right.path));
  await construction.populateDirectory(scope,entries);construction.scopes.set('dev',scope);
  const source=scope.path+'/src';await writeFile(directory+'/foreign-sentinel','foreign-inert');
  await mkdir(source+'/.nx',{mode:493});await writeFile(source+'/.nx/cache','generated-cache');
  await writeFile(source+'/apps/wbs/mcp-01/src/openapi.json',construction.projection.openapiBytes);
  if(fault==='unknown-output')await writeFile(source+'/unknown-output','unrelated-inert');
  if(fault==='symlink-output'){await unlink(source+'/.nx/cache');await rmdir(source+'/.nx');await symlink(directory+'/foreign-sentinel',source+'/.nx');}
  let observationSpy;
  if(fault==='replaced-parent'){const actualLstat=outputFs.lstat;let sourceReads=0;observationSpy=spyOn(outputFs,'lstat').mockImplementation(async(path,...args)=>{if(String(path)===source&&++sourceReads===2){await rename(source+'/apps/wbs/mcp-01/src',directory+'/original-output-parent');await mkdir(source+'/apps/wbs/mcp-01/src',{mode:493});await writeFile(source+'/apps/wbs/mcp-01/src/foreign','foreign-inert');}return await actualLstat(path,...args);});}
  let census;let refusal;
  try{census=await construction.collectOutputs();}catch(cause){refusal=cause;}finally{observationSpy?.mockRestore();}
  evidence={refused:refusal instanceof Error,outputs:census?.outputs.map(output=>output.path).sort(),parents:census?.parents.map(parent=>parent.path).sort(),foreignIntact:(await readFile(directory+'/foreign-sentinel','utf8'))==='foreign-inert'};
  if(fault===''){
   for(const member of [...census.residue].reverse()){const path=source+'/'+member.relative;const identity=await lstat(path,{bigint:true});if(identity.dev!==member.identity.dev||identity.ino!==member.identity.ino)throw Error('test-owned output changed');if(member.kind==='directory')await rmdir(path);else await unlink(path);}
  }
 }finally{try{await construction.close();}catch{cleanupUnproved=true;}finally{releaseOriginalStaging(retention);}}
 return {...evidence,cleanupUnproved};
}`;
    const observed = await runOwnedConstructionProbe(proposed, extra, fault);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    const evidence = JSON.parse(observed.stdout) as {
      foreignIntact: boolean;
      refused: boolean;
      outputs?: string[];
      parents?: string[];
      cleanupUnproved: boolean;
    };
    expect(evidence.foreignIntact).toBe(true);
    expect(evidence.refused).toBe(fault !== '');
    if (fault === '') {
      expect(evidence.outputs).toEqual([
        '/src/.nx',
        '/src/.nx/cache',
        '/src/apps/wbs/mcp-01/src/openapi.json',
      ]);
      expect(evidence.parents).toEqual([
        '/src',
        '/src/apps/wbs/fe-01',
        '/src/apps/wbs/mcp-01/src',
        '/src/node_modules',
      ]);
      expect(evidence.cleanupUnproved).toBe(false);
    } else expect(evidence.cleanupUnproved).toBe(true);
  }, 60000);

import * as canonicalFs from 'node:fs/promises';

import { spyOn } from 'bun:test';
import type { Node as SyntaxNode, StringLiteralLike } from 'typescript';

import type { SourceStartupManifest } from '../src/lib/source-startup-manifest';
import type { SourceFixtureAuthority } from './source-stageb-fixture';

/** Proposed synthetic canonical coordinates map only to newly owned actual inode observations. */
async function createCanonicalModelFixture(
  bindingFault: 'ordinary' | 'unbound-primitive' = 'ordinary',
) {
  const spawn = Bun.spawn.bind(Bun);
  const intercept = spyOn(Bun, 'spawn').mockImplementation((...args) => {
    const command = args[0];
    if (Array.isArray(command) && command[0] === 'git' && command.includes('init')) {
      const prepared = command[3];
      if (
        typeof prepared !== 'string' ||
        !prepared.startsWith('/tmp/puni-b1-') ||
        !prepared.endsWith('/prepared')
      )
        throw Error('unowned Git source fixture');
      mkdirSync(prepared + '/apps/wbs/mcp-01/src', { recursive: true, mode: 0o755 });
    }
    return Reflect.apply(spawn, Bun, args) as ReturnType<typeof Bun.spawn>;
  });
  let proposed: Awaited<ReturnType<typeof createConstructionFixture>>;
  try {
    proposed = await createConstructionFixture();
  } finally {
    intercept.mockRestore();
  }
  const uid = process.geteuid?.();
  const gid = process.getegid?.();
  if (uid === undefined || gid === undefined) throw Error('owned fixture principal unavailable');
  const modelRoot = proposed.directory + '/native-model';
  await canonicalFs.mkdir(modelRoot, { mode: 0o700 });
  const facility = JSON.parse(proposed.facilityBytes.toString()) as SourceFixtureAuthority;
  for (const anchor of [...facility.anchors, facility.enablement.parent]) {
    const mapped = modelRoot + anchor.path;
    await canonicalFs.mkdir(mapped, { recursive: true, mode: anchor.mode });
    await canonicalFs.chmod(mapped, anchor.mode);
    const observed = await canonicalFs.lstat(mapped, { bigint: true });
    if (observed.uid !== BigInt(uid) || observed.gid !== BigInt(gid))
      throw Error('owned model principal differs');
    anchor.device = String(observed.dev);
    anchor.inode = String(observed.ino);
    anchor.uid = Number(observed.uid);
    anchor.gid = Number(observed.gid);
  }
  for (const parent of facility.nativeCustody.parents) {
    const anchor = facility.anchors.find((anchor) => anchor.path === parent.path);
    if (anchor !== undefined) {
      parent.device = anchor.device;
      parent.inode = anchor.inode;
      parent.uid = anchor.uid;
      parent.gid = anchor.gid;
      parent.mode = anchor.mode;
    }
  }
  const machine = 'a'.repeat(32);
  facility.machineIdSha256 = hash(machine);
  const configuration = JSON.parse(proposed.owned.artifacts.configuration.toString()) as {
    sourceFiles: Record<'backend' | 'gateway' | 'mcp' | 'frontend', string>;
    sourceEnvironment: string[];
    productEnvironment: { backend: string[]; gateway: string[] };
  };
  configuration.sourceFiles.backend =
    'PORT=3100\nMIGRATE_ON_STARTUP=false\nDB_PATH=/data/development.sqlite\n';
  configuration.productEnvironment.backend = [
    'PORT=3100',
    'MIGRATE_ON_STARTUP=false',
    'DB_PATH=/data/production.sqlite',
  ];
  configuration.productEnvironment.gateway = [
    'PORT=3200',
    'BE_URL=http://be-01-' + proposed.prerequisites.activation.prod.backend.color + ':3100',
  ];
  proposed.owned.artifacts.configuration = Buffer.from(JSON.stringify(configuration) + '\n');
  facility.configurationSha256 = hash(proposed.owned.artifacts.configuration);
  const startup = JSON.parse(
    proposed.owned.artifacts['startup-manifest'].toString(),
  ) as SourceStartupManifest;
  const updated = {
    ...startup,
    configuration: startup.configuration.map((pin) => ({
      ...pin,
      size: Buffer.byteLength(configuration.sourceFiles[pin.slot]),
      sha256: hash(configuration.sourceFiles[pin.slot]),
    })),
  };
  proposed.owned.artifacts['startup-manifest'] = Buffer.from(JSON.stringify(updated) + '\n');
  proposed.prerequisites.activation.source.pins.manifestSha256 = hash(
    proposed.owned.artifacts['startup-manifest'],
  );
  proposed.owned.artifacts.prerequisites = Buffer.from(
    JSON.stringify(proposed.prerequisites) + '\n',
  );
  proposed.facilityBytes = Buffer.from(JSON.stringify(facility) + '\n');
  const worker = await buildCanonicalModelWorker(proposed, modelRoot, bindingFault);
  proposed.worker = worker;
  facility.worker.bytes = worker.bytes.byteLength;
  facility.worker.sha256 = worker.sha256;
  proposed.facilityBytes = Buffer.from(JSON.stringify(facility) + '\n');
  return {
    proposed,
    modelRoot,
    machine,
    nativeKernel: structuredClone(facility.nativeCustody),
    compilation: worker.compilation,
  };
}

/**
 * Same primitive shim body is compiled into the worker and independent no-entry controls.
 * Proof: protected packet 242f1b54 used this exact generator's ordinary hashes; six separately
 * generated omissions reached the lower observer at foreign-path, sibling-suffix, unowned-fd,
 * bad-copy-operand, foreign-sqlite and static-sqlite. Receipts 72297226 retain six causal REDs
 * and seven ordinary GREENs. Fixed private native operands remain independent of caller input;
 * these finite decisions do not establish general JavaScript, SQLite or native confinement.
 */
function canonicalWorkerShim(
  proposed: Awaited<ReturnType<typeof createConstructionFixture>>,
  modelRoot: string,
  kind: 'fs' | 'sqlite',
) {
  const envelope = proposed.migrationPackage.envelope;
  const databases = proposed.migrationPackage.databases.map((database) => database.path);
  const primitiveMap = `const modelRoot=${JSON.stringify(modelRoot)};const envelope=${JSON.stringify(envelope)};const databases=${JSON.stringify(databases)};const jobs=${JSON.stringify(proposed.directory + '/coordinator/source-stageb-constructor')};const scratchRoots=new Map();function map(path){if(typeof path!=='string'||path.length>4096||!path.startsWith('/')||path.includes('\\0')||path.split('/').slice(1).some(part=>part===''||part==='.'||part==='..'||part.length>255))throw Error('owned worker primitive path refused');if(path===envelope||path.startsWith(envelope+'/')||databases.some(database=>['','-wal','-shm','-journal'].some(suffix=>path===database+suffix)))return modelRoot+path;for(const [root,identity]of scratchRoots){if(path===root||path.startsWith(root+'/')){const current=native.lstatSync(root,{bigint:true});if(!current.isDirectory()||current.dev!==identity.dev||current.ino!==identity.ino)throw Error('owned worker original scratch changed');return path;}}throw Error('owned worker primitive coordinate refused');}`;
  return kind === 'fs'
    ? `import * as native from 'node:fs';${primitiveMap}const unsupported=()=>{throw Error('owned worker unsupported filesystem operation');};export const ftruncateSync=unsupported,realpathSync=unsupported,statSync=unsupported,fsyncSync=unsupported,writeFileSync=unsupported,readSync=unsupported,copyFileSync=unsupported;export const {constants}=native;const descriptors=new Set();function original(fd){if(!descriptors.has(fd))throw Error('owned worker foreign descriptor refused');return fd;}export function openSync(path,...args){const fd=native.openSync(map(path),...args);descriptors.add(fd);return fd;}export function closeSync(fd){native.closeSync(original(fd));descriptors.delete(fd);}export function fstatSync(fd,...args){return native.fstatSync(original(fd),...args);}export function writeSync(fd,...args){if(fd!==1)throw Error('owned worker non-control write refused');return native.writeSync(fd,...args);}export function lstatSync(path,...args){return native.lstatSync(map(path),...args);}export function existsSync(path){return native.existsSync(map(path));}export function readdirSync(path,...args){return native.readdirSync(map(path),...args);}export function readFileSync(path,...args){return native.readFileSync(typeof path==='number'?original(path):map(path),...args);}export function rmSync(path,...args){if(!scratchRoots.has(path))throw Error('owned worker foreign scratch removal refused');native.rmSync(map(path),...args);scratchRoots.delete(path);}export function mkdtempSync(path,...args){const environment=process.env.WBS_ENV;if(environment!=='prod'&&environment!=='dev')throw Error('owned worker scratch environment refused');if(path!==jobs+'/migration-'+environment+'/copy/wbs-migrate-staged-'||scratchRoots.size!==0)throw Error('owned worker scratch prefix refused');const prefix=jobs+'/migration-'+environment+'/copy';const parent=native.lstatSync(prefix,{bigint:true});if(!parent.isDirectory()||parent.uid!==BigInt(process.geteuid())||parent.gid!==BigInt(process.getegid())||(parent.mode&4095n)!==448n)throw Error('owned worker scratch parent refused');const root=native.mkdtempSync(path,...args);const identity=native.lstatSync(root,{bigint:true});scratchRoots.set(root,identity);return root;}export function cpSync(from,to,...args){return native.cpSync(map(from),map(to),...args);}export default {existsSync,readdirSync,readFileSync};`
    : `import {Database as NativeDatabase,SQLiteError} from 'bun:sqlite';const modelRoot=${JSON.stringify(modelRoot)};const databases=${JSON.stringify(databases)};function database(path){if(typeof path!=='string'||!databases.includes(path))throw Error('owned worker SQLite role refused');return modelRoot+path;}export {SQLiteError};export class Database extends NativeDatabase{constructor(path,options){super(database(path),options);}static open(){throw Error('owned worker unsupported SQLite static open');}static deserialize(){throw Error('owned worker unsupported SQLite deserialize');}static setCustomSQLite(){throw Error('owned worker unsupported SQLite library');}loadExtension(){throw Error('owned worker unsupported SQLite extension');}serialize(){throw Error('owned worker unsupported SQLite serialization');}fileControl(){throw Error('owned worker unsupported SQLite file control');}}`;
}

/** Compiles the canonical literal with primitive raw mappings before committing/installing those same bytes. */
async function buildCanonicalModelWorker(
  proposed: Awaited<ReturnType<typeof createConstructionFixture>>,
  modelRoot: string,
  bindingFault: 'ordinary' | 'unbound-primitive' = 'ordinary',
) {
  const compile = Bun.build.bind(Bun);
  const syntax = await import('typescript');
  const loaded: {
    path: string;
    sha256: string;
    transformedSha256: string;
    imports: unknown[];
    transformedImports: unknown[];
    edits: { from: string; to: string; start: number; end: number; literal: string }[];
  }[] = [];
  const resolutions: { path: string; importer: string; namespace: string }[] = [];
  const sourceSnapshots: { path: string; original: string; transformed: string }[] = [];
  const buildOptions: unknown[] = [];

  const boundary = spyOn(Bun, 'build').mockImplementation((options) => {
    buildOptions.push({
      entrypoints: options.entrypoints,
      target: options.target,
      format: options.format,
      splitting: options.splitting,
      minify: options.minify,
      sourcemap: options.sourcemap,
      naming: options.naming,
      define: options.define,
      plugins: (options.plugins ?? []).map((plugin) => plugin.name),
    });
    return compile({
      ...options,
      plugins: [
        ...(options.plugins ?? []),
        {
          name: 'canonical-worker-owned-primitives',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              resolutions.push({
                path: args.path,
                importer: args.importer,
                namespace: args.namespace,
              });
              if (
                /^(?:node:)?fs(?:\/promises)?$|^bun:sqlite$/.test(args.path) &&
                args.namespace !== 'owned-worker-primitives'
              )
                throw Error('owned worker unbound primitive resolver refused');
              return undefined;
            });
            build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async (args) => {
              const original = await Bun.file(args.path).text();
              const loader = args.path.endsWith('.ts') ? 'ts' : 'js';
              const scanner = new Bun.Transpiler({ loader });
              const imports = scanner.scanImports(original);
              const parsed = syntax.createSourceFile(
                args.path,
                original,
                syntax.ScriptTarget.Latest,
                true,
                loader === 'ts' ? syntax.ScriptKind.TS : syntax.ScriptKind.JS,
              );
              const edits: {
                from: string;
                to: string;
                start: number;
                end: number;
                literal: string;
              }[] = [];
              const visit = (node: SyntaxNode) => {
                let literal: StringLiteralLike | undefined;
                if (
                  (syntax.isImportDeclaration(node) || syntax.isExportDeclaration(node)) &&
                  node.moduleSpecifier !== undefined &&
                  syntax.isStringLiteralLike(node.moduleSpecifier)
                )
                  literal = node.moduleSpecifier;
                else if (
                  syntax.isCallExpression(node) &&
                  (node.expression.kind === syntax.SyntaxKind.ImportKeyword ||
                    (syntax.isIdentifier(node.expression) && node.expression.text === 'require')) &&
                  node.arguments.length > 0 &&
                  syntax.isStringLiteralLike(node.arguments[0])
                )
                  literal = node.arguments[0];
                if (
                  literal !== undefined &&
                  /^(?:node:)?fs(?:\/promises)?$|^bun:sqlite$/.test(literal.text)
                ) {
                  const from = literal.text;
                  const to =
                    from === 'bun:sqlite'
                      ? 'stageb:model-worker-sqlite'
                      : from.endsWith('/promises')
                        ? 'stageb:model-worker-fs-promises'
                        : 'stageb:model-worker-fs';
                  const start = literal.getStart(parsed) + 1;
                  const end = literal.end - 1;
                  edits.push({ from, to, start, end, literal: original.slice(start, end) });
                }
                syntax.forEachChild(node, visit);
              };
              visit(parsed);
              let contents = original;
              for (const edit of [...edits].sort((left, right) => right.start - left.start))
                contents = contents.slice(0, edit.start) + edit.to + contents.slice(edit.end);
              if (
                bindingFault === 'unbound-primitive' &&
                args.path.endsWith('/source-stageb-migration-worker.ts')
              )
                contents +=
                  "\nimport {existsSync as unbound} from 'node:fs';unbound('/home/puni1/forbidden-unbound-model-call');\n";
              const transformedImports = scanner.scanImports(contents);
              // Proof: canonical candidate refuses an unbound primitive injects a raw node:fs import into the actual worker load; exact refusal precedes independent approval/helper-file/child-dispatch counters, all zero.
              if (
                transformedImports.some((imported) =>
                  /^(?:node:)?fs(?:\/promises)?$|^bun:sqlite$/.test(imported.path),
                )
              )
                throw Error('owned worker unbound primitive load refused');
              sourceSnapshots.push({ path: args.path, original, transformed: contents });
              loaded.push({
                path: args.path,
                sha256: hash(original),
                transformedSha256: hash(contents),
                imports,
                transformedImports,
                edits,
              });
              return { loader, contents };
            });
            build.onResolve(
              { filter: /^stageb:model-worker-(fs|fs-promises|sqlite)$/ },
              (args) => ({ path: args.path, namespace: 'owned-worker-primitives' }),
            );
            build.onLoad({ filter: /.*/, namespace: 'owned-worker-primitives' }, (args) => ({
              loader: 'js',
              contents: args.path.endsWith('-fs-promises')
                ? `const refuse=()=>{throw Error('owned worker unsupported async primitive');};export const lstat=refuse,stat=refuse,open=refuse,opendir=refuse,readdir=refuse,readFile=refuse,writeFile=refuse,realpath=refuse,mkdir=refuse,rmdir=refuse,unlink=refuse,rename=refuse,chmod=refuse,chown=refuse,lchown=refuse,symlink=refuse,readlink=refuse,link=refuse,rm=refuse,access=refuse;`
                : canonicalWorkerShim(
                    proposed,
                    modelRoot,
                    args.path.endsWith('-fs') ? 'fs' : 'sqlite',
                  ),
            }));
          },
        },
      ],
    });
  });
  try {
    const worker = await buildSourceFixtureMigrationWorker(proposed.migrationPackage);
    const emitted = new TextDecoder().decode(worker.bytes);
    await canonicalFs.writeFile(
      '/tmp/puni-b2-public-model-20261026/last-worker-source-snapshots.json',
      JSON.stringify(sourceSnapshots),
      { mode: 0o600 },
    );
    const sqlFiles = [];
    for (const name of [
      '20261022211000_add_external_dependencies',
      '20261022212000_add_cross_project_dependency_activation',
    ])
      for (const member of ['migration.sql', 'down.sql']) {
        const path = proposed.owned.source + '/apps/wbs/be-01/drizzle/' + name + '/' + member;
        const bytes = await canonicalFs.readFile(path);
        const text = bytes.toString();
        sqlFiles.push({
          path,
          name,
          member,
          bytes: bytes.length,
          sha256: hash(bytes),
          text,
          pathBearingTokens:
            /\bATTACH\b|\bVACUUM\s+INTO\b|\bload_extension\b|\b(?:temp_store_directory|data_store_directory|writable_schema)\b/i.test(
              text,
            ),
        });
      }
    await canonicalFs.writeFile(
      '/tmp/puni-b2-public-model-20261026/last-worker-finite-sql.json',
      JSON.stringify(
        { manifestSha256: proposed.migrationPackage.migrationManifestSha256, sqlFiles },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await canonicalFs.writeFile(
      '/tmp/puni-b2-public-model-20261026/last-worker-input-closure.json',
      JSON.stringify(
        {
          compiler: { bun: Bun.version, typescript: syntax.version },
          bindingFault,
          loaded: loaded.sort((a, b) => a.path.localeCompare(b.path)),
          resolutions,
          shimSha256: {
            fs: hash(canonicalWorkerShim(proposed, modelRoot, 'fs')),
            sqlite: hash(canonicalWorkerShim(proposed, modelRoot, 'sqlite')),
          },
          emittedSha256: worker.sha256,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await canonicalFs.writeFile(
      '/tmp/puni-b2-public-model-20261026/last-worker-candidate.mjs',
      worker.bytes,
      { mode: 0o600 },
    );
    await canonicalFs.writeFile(
      '/tmp/puni-b2-public-model-20261026/last-worker-candidate-audit.json',
      JSON.stringify({
        imports: [
          ...emitted.matchAll(/\bfrom\s+["']((?:node:)?(?:fs|os|path|crypto)|bun:[^"']+)["']/g),
        ].map((match) => match[1]),
      }),
      { mode: 0o600 },
    );
    const primitiveImports = (specifier: string) =>
      [...emitted.matchAll(new RegExp(`from ["']${specifier}["']`, 'g'))].length;
    if (
      primitiveImports('(?:node:)?fs') !== 1 ||
      primitiveImports('bun:sqlite') !== 1 ||
      emitted.includes('node:fs/promises')
    )
      throw Error('owned worker has unconfined primitive imports before approval');
    return Object.freeze({
      ...worker,
      compilation: {
        loaded,
        resolutions,
        sourceSnapshots,
        buildOptions,
        compiler: { bun: Bun.version, revision: Bun.revision, typescript: syntax.version },
      },
    });
  } finally {
    try {
      await canonicalFs.writeFile(
        '/tmp/puni-b2-public-model-20261026/last-worker-load-attempt.json',
        JSON.stringify({ bindingFault, loaded, resolutions }, null, 2),
        { mode: 0o600 },
      );
    } finally {
      boundary.mockRestore();
    }
  }
}

/** Same closed test-only lifecycle body is embedded in the raw model and exercised with actual inert children. */
/**
 * Keeps original children and acquisitions until actual terminal/EOF/native-close proof.
 * Proof: core-omission-receipts.json records fourteen isolated omissions reaching the selected
 * actual inert-child controls (RED), followed by exact source restoration (GREEN).
 * Proof: additional-omission-receipts.json removes acquisition registration, release gating,
 * and the native FD-close observation; the actual owned-file controls fail before teardown.
 */
function canonicalChildLifetimeSource() {
  return String.raw`
function createRawChildLifetime(cutoffNs,wallNotAfter,cancelOriginal,readNowNs,recordUnproved){
 if(typeof cutoffNs!=='bigint'||!Number.isFinite(wallNotAfter)||typeof readNowNs!=='function'||typeof recordUnproved!=='function')throw Error('raw child original cutoff absent');
 const records=new Map();const operations=new Map();const lifetimeFailures=[];let expired=false;let stopped=false;let timer;let wake;
 const cutoff=new Promise(resolve=>{wake=resolve;});
 function remaining(){try{return Math.min(Number(cutoffNs-readNowNs())/1e6,wallNotAfter-Date.now());}catch(cause){lifetimeFailures.push(cause);recordUnproved(cause);throw cause;}}
 function failure(record,cause){record.failures.push(cause instanceof Error?cause:Error(String(cause)));}
 function settled(record){return record.status!==undefined&&record.stdout.eof&&record.stderr.eof&&record.child.stdout===record.stdout.stream&&record.child.stderr===record.stderr.stream;}
 function signal(child,requested='SIGTERM'){
  const record=records.get(child);if(record===undefined)throw Error('raw child original reference absent');
  if(requested!=='SIGTERM'&&requested!=='SIGKILL')throw Error('raw child cancellation signal refused');
  if(record.status!==undefined||child.exitCode!==null||child.signalCode!==null)return false;
  if(record.signals.has(requested))return false;record.signals.add(requested);
  try{return cancelOriginal(child,requested);}catch(cause){failure(record,cause);return false;}
 }
 function cancel(record){if(!settled(record))signal(record.child,'SIGTERM');}
 function expire(){if(expired)return;expired=true;const cause=Error('raw child original cutoff exceeded');lifetimeFailures.push(cause);recordUnproved(cause);for(const record of records.values())if(!settled(record)){failure(record,Error('raw child original cutoff exceeded'));cancel(record);}wake();}
 const allowance=remaining();if(allowance<=0)expire();else timer=setTimeout(expire,Math.max(1,Math.ceil(allowance)));
 function assertForward(){if(stopped||expired||remaining()<=0){expire();throw Error('raw child forward cutoff');}}
 function retain(child,stdoutMaximum,stderrMaximum){
  if(records.has(child))throw Error('raw child duplicate original reference');
  const record={child,status:undefined,failures:[],signals:new Set(),stdout:{stream:child.stdout,eof:false,closed:false,bytes:0,overflow:false,readFailure:undefined},stderr:{stream:child.stderr,eof:false,closed:false,bytes:0,overflow:false,readFailure:undefined},finished:undefined,resolve:undefined};
  record.finished=new Promise(resolve=>{record.resolve=resolve;});records.set(child,record);
  function completed(){if(settled(record))record.resolve();}
  child.on('error',cause=>{failure(record,cause);cancel(record);});
  child.once('close',(code,signalName)=>{record.status={code,signal:signalName};completed();});
  function drain(pipe,maximum,label){
   try{
   if(pipe.stream===null||pipe.stream===undefined){pipe.readFailure=Error('raw child '+label+' reader absent');failure(record,pipe.readFailure);cancel(record);return;}
   pipe.stream.on('error',cause=>{pipe.readFailure=cause;failure(record,cause);cancel(record);});
   pipe.stream.once('end',()=>{pipe.eof=true;completed();});
   pipe.stream.once('close',()=>{pipe.closed=true;});
   pipe.stream.on('data',chunk=>{
    try{const length=typeof chunk==='string'?Buffer.byteLength(chunk):chunk.byteLength;if(!Number.isSafeInteger(length)||length<0)throw Error('raw child invalid output chunk');pipe.bytes+=length;
     if(pipe.bytes>maximum&&!pipe.overflow){pipe.overflow=true;failure(record,Error('raw child '+label+' output bound'));cancel(record);}
    }catch(cause){pipe.readFailure=cause;failure(record,cause);cancel(record);}
   });
   }catch(cause){pipe.readFailure=cause;failure(record,cause);cancel(record);}
  }
  drain(record.stdout,stdoutMaximum,'stdout');drain(record.stderr,stderrMaximum,'stderr');
  if(expired){failure(record,Error('raw child original cutoff exceeded'));cancel(record);}else if(remaining()<=0)expire();return record;
 }
 async function within(promise){let operation=operations.get(promise);if(operation===undefined){operation={promise,phase:'pending',observed:undefined};operations.set(promise,operation);operation.observed=promise.then(value=>{operation.phase='fulfilled';operation.value=value;return operation;},cause=>{operation.phase='rejected';operation.cause=cause;return operation;});}if(remaining()<=0)expire();const observed=await Promise.race([operation.observed,cutoff.then(()=>({phase:'cutoff'}))]);if(remaining()<=0)expire();return expired?{phase:'cutoff',cause:operation.cause}:observed;}
 async function finish(){
  stopped=true;for(const record of records.values())cancel(record);
  const all=Promise.all([...records.values()].map(record=>record.finished));
  if(remaining()<=0)expire();
  await Promise.race([all,cutoff]);
  if(remaining()<=0)expire();
  const isSettled=[...records.values()].every(settled);
  if(isSettled&&timer!==undefined)clearTimeout(timer);
  return {settled:isSettled,expired,failures:[...lifetimeFailures,...[...records.values()].flatMap(record=>record.failures)],retained:[...records.values()].filter(record=>!settled(record))};
 }
 function assertRelease(){if(![...records.values()].every(settled))throw Error('raw child settlement retained');if(timer!==undefined)clearTimeout(timer);}
 function snapshot(){return [...records.values()].map(record=>({status:record.status,stdout:{eof:record.stdout.eof,closed:record.stdout.closed,bytes:record.stdout.bytes,overflow:record.stdout.overflow,readFailed:record.stdout.readFailure!==undefined},stderr:{eof:record.stderr.eof,closed:record.stderr.closed,bytes:record.stderr.bytes,overflow:record.stderr.overflow,readFailed:record.stderr.readFailure!==undefined},failures:record.failures.map(cause=>cause.message),signals:[...record.signals]}));}
 return {assertForward,retain,signal,within,finish,assertRelease,snapshot,records,operations};
}
function createRawAcquisitionLifetime(onUnproved,assertUsable){
 const records=new Map();const failures=[];let blocked;
 function block(cause){if(blocked===undefined)blocked=cause;}
 function retain(original,kind){
  const record=records.get(original)??{original,kind,descriptor:undefined,failure:undefined,closing:undefined,readProbe:undefined};
  records.set(original,record);
  try{
   if(kind==='file'&&record.descriptor===undefined)record.descriptor=original.fd;
   const close=original.close.bind(original);record.nativeClose=close;
   original.close=async(...args)=>{
    if(blocked!==undefined)throw blocked;assertUsable();
    try{
     record.closing=close(...args);await record.closing;
     if(kind==='file'&&original.fd!==-1)throw Error('raw file close remains unproved');
     if(kind==='reader'){
      let closed=false;try{record.readProbe=original.read();await record.readProbe;}catch(cause){if(cause instanceof Error&&'code'in cause&&cause.code==='ERR_DIR_CLOSED')closed=true;else throw cause;}
      if(!closed)throw Error('raw directory close remains unproved');
     }
     records.delete(original);
    }catch(cause){record.failure=cause;failures.push(cause);throw onUnproved(cause,[record,original]);}
   };
  }catch(cause){record.failure=cause;failures.push(cause);throw onUnproved(cause,[record,original]);}
  return original;
 }
 function assertRelease(){if(records.size!==0)throw Error('raw acquisition settlement retained');}
 return {retainFile:file=>retain(file,'file'),retainReader:reader=>retain(reader,'reader'),assertRelease,records,failures,block,hasRetained:()=>records.size!==0};
}
`;
}

/**
 * Frames model acquisitions around the original constructor's private failed-construction Set.
 * Proof: fresh-original-set omission reaches the independently throwing first input consumer;
 * restoration refuses before it. This prefix control uses a local Set, not construction authority.
 * Original same-builder lexical association is checked by the static emitted-call inventory.
 */
function canonicalRawModelSource(modelRoot: string, machine: string) {
  return String.raw`
import * as modelFs from 'node:fs/promises';
import * as modelSync from 'node:fs';
import * as modelChild from 'node:child_process';
import * as modelNet from 'node:net';
import {Database as ModelDatabase} from 'stageb:model-sqlite';
import {spyOn as modelSpy} from 'bun:test';
import {RetainedProbeLifetime} from 'stageb:retained-lifetime';
import {isProxy as modelIsProxy} from 'node:util/types';
import {readMonotonicNs} from 'stageb:monotonic-clock';
${canonicalChildLifetimeSource()}
${canonicalRetainedErrorSource()}
export async function runLowerConstructionProbe(inputs,artifacts,staging,journal,borrow,directory,fault,originalArchive,enclosingCutoffNs){
 const modelRoot=${JSON.stringify(modelRoot)};const machine=${JSON.stringify(machine)};
 const originalFailedConstructions=failedConstructions;
 if(originalFailedConstructions.size!==0)throw new RetainedProbeLifetime('raw construction scope was not fresh',[Error('original construction failures predate this run')],[originalFailedConstructions,inputs,artifacts,staging,journal,borrow,originalArchive]);
 const nativeFs={...modelFs};const nativeSync={...modelSync};const nativeSpawn=modelChild.spawn;const nativeKill=modelChild.ChildProcess.prototype.kill;
 const knownChildren=new Set();const attempts=[];const restores=[];const mappedRoots=['/home/puni1','/run/user/1000'];
 const originalInputs=inspectSourceInputs(inputs);const enteredNs=readMonotonicNs();const inputCutoffNs=enteredNs+BigInt(Math.max(0,Math.floor((originalInputs.originalDeadline-performance.now())*1e6)));
 if(typeof enclosingCutoffNs!=='bigint')throw Error('raw enclosing original cutoff absent');
 const rawFailureEvents=[];
 const rawLifetime=createRawChildLifetime(enclosingCutoffNs<inputCutoffNs?enclosingCutoffNs:inputCutoffNs,originalInputs.review.notAfter,(child,signal)=>nativeKill.call(child,signal),readMonotonicNs,cause=>{rawFailureEvents.push(cause);});
 let rawFrameFailure;
 const rawAcquisitions=createRawAcquisitionLifetime((cause,references)=>retainRawFailure(cause,references),assertRawFrameUsable);let installedSqliteKey;
 const rawOperations={construction:undefined,close:undefined,token:undefined};
 const retainedRawReferences=[rawLifetime,rawAcquisitions,rawOperations,rawFailureEvents,knownChildren,restores,inputs,artifacts,staging,journal,borrow,originalArchive,originalFailedConstructions];
 function retainRawFailure(cause,references=[]){
  const graph=inspectRawRetainedError(cause);
  if(rawFrameFailure!==undefined){rawFrameFailure.retain([cause,...references]);return rawFrameFailure;}
  const retained=graph.retained??new RetainedProbeLifetime(graph.unsupported===undefined?'raw original acquisition remains unproved':'raw error graph remains unproved',[Error(graph.unsupported??'original acquisition failure'),cause],[...retainedRawReferences,...graph.references,...references]);
  retained.retain([...retainedRawReferences,...references,...rawAcquisitions.records.values(),...rawLifetime.records.values()]);rawFrameFailure=retained;rawAcquisitions.block(retained);return retained;
 }

 function refuseRawRelease(originals,primary){
  const references=[...retainedRawReferences,...originals,...(primary===undefined?[]:[primary,primary.cause])];
  try{
   if(rawFrameFailure!==undefined)throw rawFrameFailure;
   if(primary!==undefined){const graph=inspectRawRetainedError(primary.cause);references.push(primary,...graph.references);if(graph.retained!==undefined||graph.unsupported!==undefined)throw retainRawFailure(primary.cause,references);}
   const failures=[...rawFailureEvents,...rawAcquisitions.failures];
   const failedC=[...originalFailedConstructions];references.push(originalFailedConstructions,...failedC);
   if(failedC.length!==0)failures.push(Error('original C failure is retained'));
   for(const record of rawLifetime.records.values()){
    references.push(record,record.child,record.stdout,record.stderr);
    failures.push(...record.failures);
    if(record.stdout.readFailure!==undefined)failures.push(record.stdout.readFailure);
    if(record.stderr.readFailure!==undefined)failures.push(record.stderr.readFailure);
    if(record.status===undefined||!record.stdout.eof||!record.stderr.eof||record.stdout.overflow||record.stderr.overflow||record.child.stdout!==record.stdout.stream||record.child.stderr!==record.stderr.stream)failures.push(Error('original raw child release remains unproved'));
   }
   references.push(...rawAcquisitions.records.values());
   if(rawAcquisitions.hasRetained())failures.push(Error('original raw acquisition remains retained'));
   if(failures.length!==0)throw retainRawFailure(new AggregateError(failures,'raw original release dependencies remain unproved'),references);
  }catch(cause){throw retainRawFailure(cause,references);}
 }
 function assertRawFrameUsable(){if(rawFrameFailure!==undefined)throw rawFrameFailure;if(rawFailureEvents.length!==0)throw retainRawFailure(new AggregateError([...rawFailureEvents],'raw original lifetime is unproved'));if(originalFailedConstructions.size!==0)throw retainRawFailure(Error('original C failure is retained'),[...originalFailedConstructions]);try{rawLifetime.assertForward();}catch(cause){throw retainRawFailure(cause);}}
 try{
 rawLifetime.assertForward();
 for(const captured of [nativeFs,nativeSync])for(const name of Object.keys(captured)){
  const original=captured[name];if(typeof original!=='function'||name==='closeSync')continue;
  captured[name]=function(...args){assertRawFrameUsable();return Reflect.apply(original,this,args);};
 }
 const originalFilePrototype=Object.getPrototypeOf(getLifetime(staging).parent);
 for(const name of ['read','stat','write','chmod','chown','sync','close']){
  const original=originalFilePrototype[name];if(typeof original!=='function')throw retainRawFailure(Error('original FileHandle method absent'),[originalFilePrototype]);
  hook(originalFilePrototype,name,function(...args){return Reflect.apply(original,this,args);});
 }
 const modelState={blocked:[],effects:[],children:[],managerLoads:[],executionEffects:[]};
 const modelPolicy=JSON.parse(await nativeFs.readFile(directory+'/model-policy.json','utf8'));
 const configuration=JSON.parse(await nativeFs.readFile(directory+'/model-configuration.json','utf8'));
 const custody=JSON.parse(await nativeFs.readFile(directory+'/model-native-view.json','utf8'));const kernelObjects=new Map();const modeledDescriptors=new Map();
 for(const expected of custody.parents)kernelObjects.set(expected.path,{expected,kind:'directory'});
 for(const expected of [...custody.programs,...custody.loaderClosure.files])kernelObjects.set(expected.path,{expected,kind:'file'});
 for(const expected of custody.loaderClosure.links)kernelObjects.set(expected.path,{expected,kind:'symlink'});
 for(const expected of custody.endpoints)kernelObjects.set(expected.path,{expected,kind:'socket'});
 const managerRoot='/proc/'+custody.manager.pid;const helperProc=new Map();const unitPid=420002;const unitRoot='/proc/'+unitPid;const unitGroup='/user.slice/user-1000.slice/user@1000.service/model.slice/wbs-solver-supervisor.service';const unitState={registered:false,enabled:false,active:false,readiness:0,repeatShow:false};
 for(const parent of custody.parents)await nativeFs.mkdir(modelRoot+parent.path,{recursive:true,mode:448});
 for(const expected of [...custody.programs,...custody.loaderClosure.files]){
  const bytes=Buffer.from('SYNTHETIC native custody '+expected.role+' '+expected.path+'; NOT EXECUTABLE\n');
  if(bytes.length!==expected.bytes)throw Error('sealed model native byte length differs');
  await nativeFs.writeFile(modelRoot+expected.path,bytes,{mode:384});
 }
 for(const expected of custody.loaderClosure.links)await nativeFs.symlink(expected.target,modelRoot+expected.path);
 for(const expected of custody.endpoints)await nativeFs.writeFile(modelRoot+expected.path,'',{mode:384});
 await nativeFs.mkdir(modelRoot+managerRoot,{recursive:true,mode:448});
 const statColumns=['S',...Array(18).fill('0'),custody.manager.startTicks,...Array(32).fill('0')];
 await nativeFs.writeFile(modelRoot+managerRoot+'/stat',String(custody.manager.pid)+' (modeled-manager) '+statColumns.join(' ')+'\n');
 await nativeFs.writeFile(modelRoot+managerRoot+'/status','Name:\tmodeled-manager\nPid:\t'+custody.manager.pid+'\nPPid:\t1\nUid:\t1000\t1000\t1000\t1000\nGid:\t1000\t1000\t1000\t1000\nGroups:\t'+custody.manager.supplementaryGroups.join(' ')+'\n');
 await nativeFs.writeFile(modelRoot+managerRoot+'/cgroup','0::'+custody.manager.cgroup.path+'\n');
 await nativeFs.mkdir(modelRoot+managerRoot+'/ns',{mode:448});
 for(const [offset,kind] of ['pid','net','mnt'].entries())await nativeFs.symlink(kind+':['+(70000+offset)+']',modelRoot+managerRoot+'/ns/'+kind);
 function canonicalPath(path){const retained=typeof path==='string'?/^\/proc\/self\/fd\/([0-9]+)(\/.*)?$/.exec(path):null;return retained&&modeledDescriptors.has(Number(retained[1]))?modeledDescriptors.get(Number(retained[1]))+(retained[2]??''):path;}
 function kernelStat(path,actual){
  path=canonicalPath(path);
  const view=kernelObjects.get(path);if(view===undefined)return actual;
  const expected=view.expected;const kind=view.kind;const bits={file:32768,directory:16384,socket:49152,symlink:40960}[kind];
  return Object.assign(Object.create(Object.getPrototypeOf(actual)),actual,{dev:BigInt(expected.device),ino:BigInt(expected.inode),uid:BigInt(expected.uid),gid:BigInt(expected.gid),mode:BigInt(bits|expected.mode),...(expected.bytes===undefined?{}:{size:BigInt(expected.bytes)}),...(expected.mtimeNs===undefined?{}:{mtimeNs:BigInt(expected.mtimeNs),ctimeNs:BigInt(expected.ctimeNs)}),isFile:()=>kind==='file',isDirectory:()=>kind==='directory',isSocket:()=>kind==='socket',isSymbolicLink:()=>kind==='symlink'});
 }
 function helperAt(path){if(typeof path!=='string')return undefined;const match=/^\/proc\/([0-9]+)(\/.*)?$/.exec(path);return match?helperProc.get(Number(match[1])):undefined;}
 function nativeRead(path){if(path==='/tmp/puni-age-tool-20261026/verified-v1.3.2'||path==='/tmp/puni-age-tool-20261026/verified-v1.3.2/age')return path;const helper=helperAt(path);if(helper!==undefined){if(path.endsWith('/exe'))return mapped(helper.program);if(path.endsWith('/stat')||path.endsWith('/status')||path.endsWith('/children'))return path;}return mapped(path);}


 function denied(operation,path){modelState.blocked.push({operation,path:String(path)});throw Error('raw source model blocked '+operation+' '+String(path));}
 function mapped(path){
  if(typeof path!=='string')return denied('non-string path',path);
  if(path.includes('\0')||path.split('/').some(part=>part==='..'))return denied('noncanonical path',path);
  if(kernelObjects.has(path)||custody.loaderClosure.absentPaths.includes(path)||path===managerRoot||path===managerRoot+'/stat'||path===managerRoot+'/status'||path===managerRoot+'/cgroup'||path.startsWith(managerRoot+'/ns/'))return modelRoot+path;
  if(path===managerRoot+'/exe')return modelRoot+custody.programs[4].path;
  if(mappedRoots.some(root=>path===root||path.startsWith(root+'/')))return modelRoot+path;
  if(path===directory||path.startsWith(directory+'/'))return path;
  if(path==='/etc/machine-id')return modelRoot+'/machine-id';
  if(path===unitRoot||path.startsWith(unitRoot+'/'))return modelRoot+path;
  if(path==='/sys/fs/cgroup'+unitGroup||path.startsWith('/sys/fs/cgroup'+unitGroup+'/'))return modelRoot+path;
  if(path==='/proc')return modelRoot+'/proc';
  if(path==='/proc/sys/kernel/random/boot_id')return modelRoot+'/boot-id';
  const retained=/^\/proc\/self\/(?:fdinfo|fd)\/([0-9]+)(?:\/.*)?$/.exec(path);
  if(retained){const target=nativeSync.readlinkSync('/proc/self/fd/'+retained[1]);if(target===directory||target.startsWith(directory+'/'))return path;return denied('unowned retained descriptor',path);}
  return denied('path',path);
 }
 await nativeFs.writeFile(modelRoot+'/machine-id',machine+'\n',{mode:384});
 await nativeFs.writeFile(modelRoot+'/boot-id','11111111-2222-4333-8444-555555555555\n',{mode:384});
 function hook(owner,name,implementation){
  const guarded=function(...args){
   if(name!=='closeSync')assertRawFrameUsable();
   function failed(cause){const graph=inspectRawRetainedError(cause);if(graph.retained!==undefined||graph.unsupported!==undefined)throw retainRawFailure(cause,graph.references);throw cause;}
   try{const observed=Reflect.apply(implementation,this,args);return observed instanceof Promise?observed.catch(failed):observed;}catch(cause){return failed(cause);}
  };
  const spy=modelSpy(owner,name).mockImplementation(guarded);restores.push(()=>spy.mockRestore());
 }
 for(const name of ['readdir','readFile'])hook(modelFs,name,async(path,...args)=>{
  const helper=helperAt(path);if(helper!==undefined&&path.endsWith('/cmdline')&&helper.requestedArgv!==undefined)return Buffer.from(helper.requestedArgv.join('\0')+'\0');if(helper!==undefined&&path.endsWith('/status')&&helper.manager)return 'Name:\tmodeled-final-cli\nUid:\t1000\t1000\t1000\t1000\nGid:\t1000\t1000\t1000\t1000\nGroups:\t\nNoNewPrivs:\t1\n'+['CapInh','CapPrm','CapEff','CapBnd','CapAmb'].map(field=>field+':\t0000000000000000\n').join('');
  return await nativeFs[name](nativeRead(path),...args);
 });
 for(const name of ['writeFile','mkdir','rmdir','unlink','chmod','chown','lchown'])hook(modelFs,name,(path,...args)=>nativeFs[name](mapped(path),...args));
 for(const name of ['lstat','stat'])hook(modelFs,name,async(path,...args)=>kernelStat(path,await nativeFs[name](nativeRead(path),...args)));
 hook(modelFs,'open',async(path,flags,...args)=>{
  const helper=helperAt(path);const target=helper!==undefined&&path.endsWith('/exe')?nativeRead(path):(path==='/tmp/puni-age-tool-20261026/verified-v1.3.2'||path==='/tmp/puni-age-tool-20261026/verified-v1.3.2/age')&&(typeof flags==='number'?(flags&3)===0:flags==='r')?path:mapped(path);
  const file=await nativeFs.open(target,flags,...args);try{rawAcquisitions.retainFile(file);const canonical=helper!==undefined&&path.endsWith('/exe')?helper.program:path===managerRoot+'/exe'?custody.programs[4].path:canonicalPath(path);
  if(kernelObjects.has(canonical)){modeledDescriptors.set(file.fd,canonical);const stat=file.stat.bind(file);file.stat=async(...args)=>kernelStat(canonical,await stat(...args));const close=file.close.bind(file);file.close=async()=>{const fd=file.fd;await close();modeledDescriptors.delete(fd);};}
  return file;}catch(cause){throw retainRawFailure(cause,[file]);}
 });
 for(const name of ['openSync','writeFileSync','mkdirSync','rmdirSync','unlinkSync','chmodSync','chownSync'])hook(modelSync,name,(path,...args)=>nativeSync[name](mapped(path),...args));
 for(const name of ['lstatSync','statSync'])hook(modelSync,name,(path,...args)=>kernelStat(path,nativeSync[name](nativeRead(path),...args)));
 hook(modelSync,'existsSync',(path)=>nativeSync.existsSync(mapped(path)));
 hook(modelSync,'readlinkSync',(path,...args)=>nativeSync.readlinkSync(mapped(path),...args));
 for(const name of ['readdirSync','readFileSync'])hook(modelSync,name,(path,...args)=>nativeSync[name](nativeRead(path),...args));
 hook(modelSync,'fstatSync',(fd,...args)=>kernelStat(modeledDescriptors.get(fd),nativeSync.fstatSync(fd,...args)));
 hook(modelFs,'realpath',async(path,...args)=>{const target=await nativeFs.realpath(nativeRead(path),...args);return typeof target==='string'&&target.startsWith(modelRoot+'/')?target.slice(modelRoot.length):target===modelRoot?'/':target;});
 hook(modelFs,'readlink',async(path,...args)=>{if(path===managerRoot+'/exe')return custody.programs[4].path;const helper=helperAt(path);if(helper!==undefined&&path.endsWith('/exe'))return helper.program;if(helper!==undefined&&path.endsWith('/cwd')&&helper.cwd!==undefined)return helper.cwd;const target=await nativeFs.readlink(mapped(path),...args);return typeof target==='string'&&target.startsWith(modelRoot+'/')?target.slice(modelRoot.length):target;});
 hook(modelFs,'symlink',(target,path,...args)=>nativeFs.symlink(typeof target==='string'&&target.startsWith('/')?mapped(target):target,mapped(path),...args));
 hook(modelFs,'rename',(from,to,...args)=>nativeFs.rename(mapped(from),mapped(to),...args));
 function effectAtBoundary(kind,details){
  const root=directory+'/journal-parent/source-stageb-'+modelPolicy.nonce;
  const names=nativeSync.readdirSync(root).filter(name=>/^[0-9]{8}\.(claim|event)\.json$/.test(name)).sort();
  const records=names.map(name=>JSON.parse(nativeSync.readFileSync(root+'/'+name,'utf8')));
  const last=records.at(-1);if(last?.payload?.kind!=='dispatch')throw Error('raw effect has no immediately preceding durable dispatch');
  const intent=records.find(record=>record.sequence===last.payload.intentSequence);
  if(intent?.payload?.kind!=='intent')throw Error('raw effect dispatch lost original intent');
  modelState.effects.push({kind,details,sequence:last.sequence,intent:intent.payload,encodedBytes:names.reduce((sum,name)=>sum+nativeSync.statSync(root+'/'+name).size,0)});
 }
 function retainChild(child,stdoutMaximum,stderrMaximum){knownChildren.add(child);return rawLifetime.retain(child,stdoutMaximum,stderrMaximum);}
 function equal(actual,expected,label){if(JSON.stringify(actual)!==JSON.stringify(expected))return denied(label,JSON.stringify(actual));}
 function unitProjection(){
  const service='wbs-solver-supervisor.service';const bun='/home/puni1/.local/lib/wbs-solver/bun';const running=unitState.active&&unitState.readiness>=8;const activating=unitState.active&&!running;
  const exec=(path,argv)=>'{ path='+path+' ; argv[]='+argv+' ; ignore_errors=no ; start_time=[] ; stop_time=[] ; pid=0 ; code=(null) ; status=0 }';
  const fields={LoadState:'loaded',Id:service,Names:service,FragmentPath:'/home/puni1/.config/systemd/user/'+service,DropInPaths:'',Transient:'no',NeedDaemonReload:'no',ExecStart:exec(bun,bun+' /home/puni1/.local/lib/wbs-solver/solver-supervisor.js --config=/home/puni1/.config/wbs-solver/solver-supervisor.json --admission=policy'),ExecStartPre:'',ExecStartPost:'',ExecStop:'',ExecStopPost:exec('/bin/rm','/bin/rm -f /run/user/1000/wbs-solver/supervisor.sock'),Restart:'always',RestartPreventExitStatus:'78',Result:'success',ExecMainStatus:'0',KillMode:'control-group',Environment:'WBS_EDGE_STATE=/home/puni1/wbs/state',ActiveState:running?'active':activating?'activating':'inactive',SubState:running?'running':activating?'start':'dead',MainPID:unitState.active?String(unitPid):'0',ControlPID:'0',InvocationID:unitState.active?'a'.repeat(32):'',ControlGroup:unitState.active?unitGroup:'',Job:'0',RuntimeDirectoryMode:'0750',RuntimeDirectoryPreserve:'restart',RestartUSec:'1s',NRestarts:'0'};
  const missing=fault==='k3'?['ExecStartPre','ExecStartPost','ExecStop']:[];
  return Object.entries(fields).filter(([name])=>!missing.includes(name)).map(([name,value])=>name+'='+value).join('\n')+'\n';
 }
 function startUnitModel(){
  const root=modelRoot+unitRoot;nativeSync.mkdirSync(root,{recursive:true,mode:448});
  const columns=['S',...Array(18).fill('0'),'90002',...Array(32).fill('0')];
  nativeSync.writeFileSync(root+'/stat',String(unitPid)+' (modeled-supervisor) '+columns.join(' ')+'\n');
  nativeSync.writeFileSync(root+'/status','Name:\tmodeled-supervisor\nPid:\t'+unitPid+'\nPPid:\t'+custody.manager.pid+'\nUid:\t1000\t1000\t1000\t1000\nGid:\t1000\t1000\t1000\t1000\nGroups:\t1000\n');
  nativeSync.writeFileSync(root+'/cgroup','0::'+unitGroup+'\n');nativeSync.mkdirSync(root+'/ns',{mode:448});for(const [offset,kind] of ['pid','net','mnt'].entries())nativeSync.symlinkSync(kind+':['+(71000+offset)+']',root+'/ns/'+kind);
  const bun='/home/puni1/.local/lib/wbs-solver/bun';nativeSync.writeFileSync(root+'/cmdline',[bun,'/home/puni1/.local/lib/wbs-solver/solver-supervisor.js','--config=/home/puni1/.config/wbs-solver/solver-supervisor.json','--admission=policy',''].join('\0'));
  nativeSync.symlinkSync(mapped(bun),root+'/exe');nativeSync.symlinkSync(modelRoot+'/home/puni1',root+'/cwd');
  const group=modelRoot+'/sys/fs/cgroup'+unitGroup;nativeSync.mkdirSync(group,{recursive:true,mode:448});nativeSync.writeFileSync(group+'/cgroup.events','populated 1\n');nativeSync.writeFileSync(group+'/cgroup.procs',String(unitPid)+'\n');
  const socket='/run/user/1000/wbs-solver/supervisor.sock';nativeSync.writeFileSync(mapped(socket),'',{mode:384});const identity=nativeSync.lstatSync(mapped(socket),{bigint:true});kernelObjects.set(socket,{expected:{device:String(identity.dev),inode:String(identity.ino),uid:Number(identity.uid),gid:Number(identity.gid),mode:Number(identity.mode&4095n)},kind:'socket'});
 }
 function stopUnitModel(){
  nativeSync.rmSync(modelRoot+unitRoot,{recursive:true});nativeSync.rmSync(modelRoot+'/sys/fs/cgroup'+unitGroup,{recursive:true});
  const socket='/run/user/1000/wbs-solver/supervisor.sock';nativeSync.unlinkSync(mapped(socket));kernelObjects.delete(socket);nativeSync.rmdirSync(mapped('/run/user/1000/wbs-solver'));
 }
 function imageView(image){
  const product=image.role==='backend'||image.role==='gateway';const config=product?{Labels:{WBS_SHA:modelPolicy.sourceSha},WorkingDir:'/app/apps/wbs/'+(image.role==='backend'?'be-01':'gw-01'),Cmd:['bun','run','src/main.ts'],Entrypoint:null,Env:configuration.productEnvironment[image.role]}:{Labels:{WBS_SHA:modelPolicy.sourceSha},WorkingDir:'/src',Cmd:['bun','run','dev'],Entrypoint:null,Env:configuration.sourceEnvironment};
  return {Id:image.imageId,RepoDigests:[image.reference],RepoTags:[],Config:config};
 }
 function fixedReply(command,args,options){
  if(command==='/usr/bin/setpriv'){
   equal(args.slice(0,8),['--reuid=1000','--regid=1000','--clear-groups','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all','--no-new-privs','--'],'manager credential prefix');
   equal(options,{cwd:'/',env:{HOME:'/home/puni1',USER:'puni1',LOGNAME:'puni1',XDG_CONFIG_HOME:'/home/puni1/.config',XDG_RUNTIME_DIR:'/run/user/1000',DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1000/bus',PATH:'/usr/bin:/bin',LC_ALL:'C'},stdio:['ignore','pipe','pipe']},'manager closed options');
   const argv=args.slice(8);const expected=['/usr/bin/busctl','--user','--no-pager','--allow-interactive-authorization=no','--auto-start=no','--json=short','call','org.freedesktop.systemd1','/org/freedesktop/systemd1','org.freedesktop.systemd1.Manager','ListUnitsByPatterns','asas','0','1','wbs-solver-supervisor.service'];
   if(argv[0]==='/usr/bin/busctl'&&argv.includes('ListUnitsByPatterns')){equal(argv,expected,'manager absence argv');if(unitState.active||unitState.registered)return denied('manager false absence',argv);return {program:argv[0],manager:true,code:0,stdout:'{"type":"a(ssssssouso)","data":[[]]}\n',stderr:''};}
   if(argv[0]==='/usr/bin/systemctl'){
    const operation=argv[4];
    if(operation==='show'){
     const service='wbs-solver-supervisor.service';const properties=['LoadState','Id','Names','FragmentPath','DropInPaths','Transient','NeedDaemonReload','ExecStart','ExecStartPre','ExecStartPost','ExecStop','ExecStopPost','Restart','RestartPreventExitStatus','Result','ExecMainStatus','KillMode','Environment','ActiveState','SubState','MainPID','ControlPID','InvocationID','ControlGroup','Job','RuntimeDirectoryMode','RuntimeDirectoryPreserve','RestartUSec','NRestarts'];
     equal(argv,['/usr/bin/systemctl','--user','--no-pager','--no-ask-password','show',service,...properties.map(name=>'--property='+name)],'manager show argv');
     if(!unitState.registered)return denied('show without installed definition',service);if(unitState.repeatShow)unitState.repeatShow=false;else if(unitState.active)unitState.readiness++;return {program:argv[0],manager:true,code:0,stdout:unitProjection(),stderr:''};
    }
    if(!['daemon-reload','enable','restart','stop','disable'].includes(operation))return denied('unknown manager mutation',operation);
    equal(argv,['/usr/bin/systemctl','--user','--no-pager','--no-ask-password',operation,...(operation==='daemon-reload'?[]:['wbs-solver-supervisor.service'])],'manager mutation argv');
    if(operation==='daemon-reload'){unitState.registered=nativeSync.existsSync(mapped('/home/puni1/.config/systemd/user/wbs-solver-supervisor.service'));}
    if(operation==='enable')unitState.enabled=true;
    if(operation==='restart'){if(!unitState.registered||!unitState.enabled||unitState.active)return denied('unit start state',operation);unitState.active=true;startUnitModel();}
    if(operation==='stop'&&unitState.active){stopUnitModel();unitState.active=false;}
    if(operation==='disable'){nativeSync.unlinkSync(mapped(modelPolicy.enablement.parent.path+'/'+modelPolicy.enablement.leaf));unitState.enabled=false;}
    return {program:argv[0],manager:true,code:0,stdout:'',stderr:''};
   }
   if(argv[0]==='/usr/bin/busctl'&&argv.includes('LoadUnit')){
    equal(argv,['/usr/bin/busctl','--user','--no-pager','--allow-interactive-authorization=no','--auto-start=no','--json=short','call','org.freedesktop.systemd1','/org/freedesktop/systemd1','org.freedesktop.systemd1.Manager','LoadUnit','s','wbs-solver-supervisor.service'],'manager LoadUnit argv');
    unitState.repeatShow=true;modelState.managerLoads.push(argv);return {program:argv[0],manager:true,code:0,stdout:'{"type":"o","data":["/org/freedesktop/systemd1/unit/wbs_2dsolver_2dsupervisor_2eservice"]}\n',stderr:''};
   }
   if(argv[0]==='/usr/bin/busctl'&&argv.includes('get-property')){
    const property=argv.at(-1);if(!['ExecStartPre','ExecStartPost','ExecStop'].includes(property))return denied('unknown hook',property);
    equal(argv,['/usr/bin/busctl','--user','--no-pager','--allow-interactive-authorization=no','--auto-start=no','--json=short','get-property','org.freedesktop.systemd1','/org/freedesktop/systemd1/unit/wbs_2dsolver_2dsupervisor_2eservice','org.freedesktop.systemd1.Service',property],'manager hook argv');
    return {program:argv[0],manager:true,code:0,stdout:'{"type":"a(sasbttttuii)","data":[]}\n',stderr:''};
   }
   return denied('manager unknown argv',argv);
  }
  if(command==='/usr/bin/docker'){
   equal(options,{cwd:modelPolicy.coordinator.directory,env:{DOCKER_HOST:'unix:///run/docker.sock',DOCKER_CONFIG:modelPolicy.coordinator.directory,LANG:'C.UTF-8',TZ:'UTC'},stdio:['pipe','pipe','pipe']},'docker closed options');
   if(JSON.stringify(args)===JSON.stringify(['image','inspect','wbs-dev-src:1']))return {program:command,manager:false,code:1,stdout:'[]\n',stderr:'Error response from daemon: No such image: wbs-dev-src:1\n'};
   if(JSON.stringify(args)===JSON.stringify(['container','ls','--all','--no-trunc','--format','{{json .ID}}'])||JSON.stringify(args)===JSON.stringify(['network','ls','--no-trunc','--format','{{json .ID}}']))return {program:command,manager:false,code:0,stdout:'',stderr:''};
   if(args.length===3&&args[0]==='image'&&args[1]==='inspect'){
    const image=modelPolicy.images.find(image=>image.reference===args[2]);if(image===undefined)return denied('unlisted image',args[2]);return {program:command,manager:false,code:0,stdout:JSON.stringify([imageView(image)])+'\n',stderr:''};
   }
  }
  return denied('spawn',command+' '+args.join(' '));
 }
 hook(modelChild,'spawn',(command,args,options)=>{
  rawLifetime.assertForward();
  const runtime=modelPolicy.coordinator.directory+'/source-stageb-constructor/bun';
  if(command===runtime){
   const environment=args[3];if(environment!=='prod'&&environment!=='dev')return denied('worker environment',environment);
   const worker=modelPolicy.coordinator.directory+'/source-stageb-constructor/migration-worker.mjs';
   equal(args,['--no-env-file','run',worker,environment],'fixed worker argv');
   const cwd=modelPolicy.coordinator.directory+'/source-stageb-constructor/migration-'+environment;
   equal(options,{cwd,env:{WBS_ENV:environment,TMPDIR:cwd+'/copy',SQLITE_TMPDIR:cwd+'/sqlite',BUN_RUNTIME_TRANSPILER_CACHE_PATH:'0',LANG:'C.UTF-8',TZ:'UTC'},stdio:['pipe','pipe','pipe']},'fixed worker options');
   effectAtBoundary('fixed-worker',{command,args,options});
   const child=nativeSpawn(mapped(command),['--no-env-file','run',mapped(worker),environment],options);
   try{retainChild(child,2056,8192);if(child.pid===undefined)throw Error('owned fixed worker pid absent');helperProc.set(child.pid,{program:command,manager:false,child,requestedArgv:[command,...args],cwd});modelState.children.push(child);const receipt={kind:'real-owned-fixed-worker',environment,pid:child.pid,actualArgv:[mapped(command),'--no-env-file','run',mapped(worker),environment],actualCwd:options.cwd,phases:[],stderrBytes:0,status:undefined,start:undefined,diagnostic:undefined};
   const acquiredStat=nativeSync.readFileSync('/proc/'+child.pid+'/stat','utf8');receipt.start=acquiredStat.slice(acquiredStat.lastIndexOf(') ')+2).split(' ').at(19);
   let control=Buffer.alloc(0);child.stdout.on('data',chunk=>{if(control.length+chunk.length>2056)receipt.diagnostic='control bound exceeded';else control=Buffer.concat([control,Buffer.from(chunk)]);});child.stderr.on('data',chunk=>{receipt.stderrBytes+=chunk.length;});
   child.once('close',(code,signal)=>{receipt.status={code,signal,closed:true};try{for(let offset=0;offset<control.length;){const length=control.readUInt32BE(offset);const frame=JSON.parse(control.subarray(offset+4,offset+4+length).toString());receipt.phases.push({phase:frame.phase,...(frame.reason===undefined?{}:{reason:frame.reason})});offset+=4+length;}}catch(cause){receipt.diagnostic=cause instanceof Error?cause.name:'unrecognized terminal bytes';}});modelState.executionEffects.push(receipt);return child;}catch(cause){throw retainRawFailure(cause,[child,child.stdin,child.stdout,child.stderr]);}
  }
  if(command!=='/usr/bin/setpriv'&&command!=='/usr/bin/docker')return denied('spawn',command);
  effectAtBoundary('native-cli',{command,args,options});const reply=fixedReply(command,args,options);
  const script='setTimeout(()=>{process.stdout.write('+JSON.stringify(reply.stdout)+');process.stderr.write('+JSON.stringify(reply.stderr)+');process.exit('+reply.code+');},120);';
  const child=nativeSpawn(process.execPath,['--no-env-file','-e',script],{cwd:directory,env:{WBS_ENV:'dev',TMPDIR:directory},stdio:['pipe','pipe','pipe']});
  try{retainChild(child,reply.manager?65536:4194304,reply.manager?65536:8192);if(child.pid===undefined)throw Error('owned inert child pid absent');helperProc.set(child.pid,{program:reply.program,manager:reply.manager,child});modelState.children.push(child);return child;}catch(cause){throw retainRawFailure(cause,[child,child.stdin,child.stdout,child.stderr]);}
 });
 hook(process,'kill',(pid,signal)=>denied('numeric signal',String(pid)));
 hook(modelChild.ChildProcess.prototype,'kill',function(signal){if(!knownChildren.has(this))return denied('foreign child signal',String(this.pid));return rawLifetime.signal(this,signal??'SIGTERM');});
 hook(modelNet,'createConnection',()=>denied('network connect','network'));
 hook(modelNet,'connect',()=>denied('network connect','network'));
 hook(modelNet.Server.prototype,'listen',()=>denied('network listen','network'));
 const sqliteKey=Symbol.for('stageb.test.sqlite.map');installedSqliteKey=sqliteKey;
 globalThis[sqliteKey]=(path)=>{assertRawFrameUsable();if(path===directory+'/sqlite-preflight-alias')return directory+'/sqlite-preflight.sqlite';if(path==='/home/puni1/wbs/data/production.sqlite'||path==='/home/puni1/wbs-dev/data/development.sqlite')return mapped(path);return denied('SQLite role',path);};
 async function censusOriginalDatabaseFds(){
  const identities=new Set();for(const database of modelPolicy.migration.databases)for(const suffix of ['','-wal','-shm','-journal']){
   try{const identity=await nativeFs.lstat(mapped(database.path+suffix),{bigint:true});identities.add(String(identity.dev)+':'+String(identity.ino));}catch(cause){if(suffix!==''&&cause instanceof Error&&'code'in cause&&cause.code==='ENOENT')continue;throw cause;}
  }
  const directory=await nativeFs.opendir('/proc/self/fd');rawAcquisitions.retainReader(directory);const openers=[];
  try{for(;;){const entry=await directory.read();if(entry===null)break;if(!/^[0-9]+$/.test(entry.name))throw Error('original database FD census name malformed');const fd=Number(entry.name);const identity=nativeSync.fstatSync(fd,{bigint:true});if(identities.has(String(identity.dev)+':'+String(identity.ino)))openers.push({fd,device:String(identity.dev),inode:String(identity.ino),target:nativeSync.readlinkSync('/proc/self/fd/'+fd)});}}finally{await directory.close();}
  return openers;
 }
 let token;let primary;let inspection;let beforeClose;let afterClose;let databaseOpeners;let closeMemoized=false;let originalConstruction;let originalClose;let constructionUnproved=false;let closeProved=false;let retainedPrimary;const cleanupFailures=[];
 let joinedOriginalClose;let originalRawSettlement;
 function closeRawOriginal(){
  if(joinedOriginalClose!==undefined)return joinedOriginalClose;
  const original=constructions.get(token);
  if(original===undefined)throw retainRawFailure(Error('original construction ownership absent'),[token]);
  const construction=original.construction;const ownership=original.ownership;const closing=construction.close();
  rawOperations.close=closing;
  joinedOriginalClose=(async()=>{
   try{
    const closed=await rawLifetime.within(closing);if(closed.phase!=='fulfilled')throw closed.phase==='rejected'?closed.cause:Error('raw C close original cutoff');
    afterClose=await inspectSourceJournal(journal);
    const settlement=await rawLifetime.finish();originalRawSettlement=settlement;if(!settlement.settled||settlement.failures.length!==0)throw new AggregateError(settlement.failures,'raw C child settlement remains unproved');
    refuseRawRelease([token,original,construction,ownership,closing,settlement]);
    const first=closeSourcePrerequisites(token);const second=closeSourcePrerequisites(token);closeMemoized=first===second;
    await first;
   }catch(cause){throw retainRawFailure(cause,[token,original,construction,ownership,closing]);}
  })();
  return joinedOriginalClose;
 }

 try{
  if(fault==='interceptor-preflight'){
   const sqlite=new ModelDatabase(directory+'/sqlite-preflight-alias',{create:true});try{sqlite.run('CREATE TABLE raw_boundary(value INTEGER);');}finally{sqlite.close();}
   await nativeFs.lstat(directory+'/sqlite-preflight.sqlite');
   const actual=await modelFs.lstat('/home/puni1',{bigint:true});if(String(actual.ino)!==modelPolicy.anchors[0].inode)throw Error('mapped real inode differs');
   for(const effect of [()=>modelChild.spawn('/usr/bin/systemctl',['--user','restart','wbs-solver-supervisor.service']),()=>process.kill(2147483000,'SIGKILL'),()=>modelChild.ChildProcess.prototype.kill.call({pid:2147483000},'SIGKILL'),()=>modelFs.lstat('/home/foreign')]){let refused=false;try{await effect();}catch{refused=true;}if(!refused)throw Error('raw interceptor allowed an unsafe effect');}
  }else{
   originalConstruction=buildSourcePrerequisites(inputs,artifacts,staging,journal,originalArchive,refuseRawRelease);rawOperations.construction=originalConstruction;const built=await rawLifetime.within(originalConstruction);
   if(built.phase==='cutoff'){constructionUnproved=true;throw Error('raw construction original cutoff');}if(built.phase==='rejected')throw built.cause;token=built.value;rawOperations.token=token;
   inspection=inspectSourcePrerequisites(token);databaseOpeners=await censusOriginalDatabaseFds();beforeClose=await inspectSourceJournal(journal);
   const first=closeRawOriginal();originalClose=first;rawOperations.close=originalClose;await first;closeProved=true;
  }
 }catch(cause){const graph=inspectRawRetainedError(cause);if(rawFrameFailure!==undefined||graph.retained!==undefined||graph.unsupported!==undefined)retainedPrimary=retainRawFailure(cause,graph.references);else primary=cause;
 }finally{
  if(retainedPrimary!==undefined)throw retainedPrimary;
  if(token!==undefined&&!closeProved){
   try{if(originalClose===undefined){originalClose=closeRawOriginal();rawOperations.close=originalClose;}await originalClose;closeProved=true;}catch(cause){cleanupFailures.push(cause);}
  }
  const settlement=originalRawSettlement??await rawLifetime.finish();cleanupFailures.push(...settlement.failures);
  let failedC=[];let cMembershipUnknown=false;try{failedC=[...originalFailedConstructions];}catch(cause){cMembershipUnknown=true;cleanupFailures.push(cause);}
  if(rawFailureEvents.length!==0||!settlement.settled||constructionUnproved||(token!==undefined&&!closeProved)||cMembershipUnknown||failedC.length!==0||rawAcquisitions.hasRetained()){
   const failures=[primary,...cleanupFailures].filter(cause=>cause!==undefined);
   throw new RetainedProbeLifetime('raw dependencies remain unproved',failures,[rawLifetime,rawAcquisitions,...rawAcquisitions.records.values(),...rawLifetime.records.values(),knownChildren,restores,token,originalConstruction,originalClose,originalFailedConstructions,...failedC,inputs,artifacts,staging,journal,borrow,originalArchive,helperProc,modeledDescriptors]);
  }
  rawLifetime.assertRelease();rawAcquisitions.assertRelease();
  delete globalThis[sqliteKey];installedSqliteKey=undefined;for(const restore of restores.reverse())try{restore();}catch(cause){cleanupFailures.push(cause);}
  if(cleanupFailures.length!==0)primary=new AggregateError([primary,...cleanupFailures].filter(cause=>cause!==undefined),'raw model primary and settled cleanup failures');
 }
 function messages(cause){const graph=inspectRawRetainedError(cause);if(graph.retained!==undefined||graph.unsupported!==undefined)throw retainRawFailure(cause,graph.references);return graph.messages;}
 return {success:token!==undefined&&primary===undefined,primary:primary===undefined?[]:messages(primary),packet:inspection?.packet,closeMemoized,blocked:modelState.blocked,children:modelState.children.length,effects:modelState.effects,beforeClose,afterClose,databaseOpeners,executionEffects:modelState.executionEffects};
 }catch(cause){
  const graph=inspectRawRetainedError(cause);if(rawFrameFailure!==undefined||graph.retained!==undefined||graph.unsupported!==undefined)throw retainRawFailure(cause,graph.references);
  const failures=[cause];let settlement;try{settlement=await rawLifetime.finish();failures.push(...settlement.failures);}catch(failure){failures.push(failure);}
  let failedC=[];let unknownMembership=false;try{failedC=[...originalFailedConstructions];}catch(failure){unknownMembership=true;failures.push(failure);}
  failures.push(...rawAcquisitions.failures);
  if(rawFailureEvents.length!==0||settlement===undefined||!settlement.settled||rawAcquisitions.hasRetained()||unknownMembership||failedC.length!==0)throw new RetainedProbeLifetime('raw protected frame remains unproved',failures,[...retainedRawReferences,...rawAcquisitions.records.values(),...rawLifetime.records.values(),...failedC]);
  rawLifetime.assertRelease();rawAcquisitions.assertRelease();
  if(installedSqliteKey!==undefined)delete globalThis[installedSqliteKey];
  for(const restore of restores.reverse())try{restore();}catch(failure){failures.push(failure);}
  throw new AggregateError(failures,'raw protected frame failed after proved settlement');
 }
}
`;
}

type CanonicalFixture = Awaited<ReturnType<typeof createCanonicalModelFixture>>;
type CanonicalHandoff = Readonly<{
  candidateSha256: string;
  receiptPath: string;
}>;
const canonicalHandoffs = new WeakMap<
  CanonicalHandoff,
  {
    fixture: CanonicalFixture;
    bytes: Uint8Array;
    proposed: CanonicalFixture['proposed'];
    worker: CanonicalFixture['proposed']['worker'];
    proposalPin: string;
    fault: string;
    mode: 'public';
  }
>();

function canonicalProposalPin(fixture: CanonicalFixture, fault: string, mode: 'public') {
  const proposed = fixture.proposed;
  return hash(
    JSON.stringify({
      directory: proposed.directory,
      modelRoot: fixture.modelRoot,
      machine: fixture.machine,
      nativeKernel: fixture.nativeKernel,
      sourceSha: proposed.owned.sha,
      operation: { fault, mode },
      compilation: fixture.compilation,
      package: proposed.migrationPackage,
      facility: hash(proposed.facilityBytes),
      roster: hash(proposed.rosterBytes),
      producers: proposed.producerBytes.map(hash),
      artifacts: Object.entries(proposed.owned.artifacts).map(([slot, bytes]) => [
        slot,
        hash(bytes),
      ]),
      worker: {
        sha256: hash(proposed.worker.bytes),
        commitment: proposed.worker.sha256,
        bytes: proposed.worker.bytes.byteLength,
        maps: proposed.worker.maps.map((map) => ({ path: map.path, sha256: hash(map.bytes) })),
      },
    }),
  );
}

/** Prepares one private single-use handoff before I; a comparison receipt never becomes native authority. */
async function prepareCanonicalHandoff(fault = ''): Promise<CanonicalHandoff> {
  const fixture = await createCanonicalModelFixture(
    fault === 'unbound-primitive' ? 'unbound-primitive' : 'ordinary',
  );
  if (fault === 'handoff-byte-mismatch') {
    const text = new TextDecoder().decode(fixture.proposed.worker.bytes);
    const changed = text.replace(
      'const enteredAt = performance.now();',
      'const enteredAt = performance.now() + 1;',
    );
    if (changed === text) throw Error('finite audit mismatch injection absent');
    const bytes = new TextEncoder().encode(changed);
    fixture.proposed.worker = { ...fixture.proposed.worker, bytes, sha256: hash(bytes) };
    const facility = JSON.parse(
      fixture.proposed.facilityBytes.toString(),
    ) as SourceFixtureAuthority;
    facility.worker = { ...facility.worker, bytes: bytes.byteLength, sha256: hash(bytes) };
    fixture.proposed.facilityBytes = Buffer.from(JSON.stringify(facility) + '\n');
    await canonicalFs.writeFile(
      fixture.proposed.directory + '/finite-handoff-rejected-candidate.mjs',
      bytes,
      { mode: 0o400 },
    );
    await canonicalFs.writeFile(
      '/tmp/puni-b2-public-model-20261026/handoff-mismatch-input.json',
      JSON.stringify({
        directory: fixture.proposed.directory,
        candidateSha256: hash(bytes),
        bytes: bytes.length,
        facilitySha256: hash(fixture.proposed.facilityBytes),
        fault:
          'enteredAt expression +1; proposed worker/facility hash and size recommitted before comparison',
      }),
      { mode: 0o600 },
    );
  }
  const comparison = await compareCanonicalHandoff(fixture);
  const prepared = Object.freeze({
    candidateSha256: hash(fixture.proposed.worker.bytes),
    receiptPath: comparison.receiptPath,
  });
  canonicalHandoffs.set(prepared, {
    fixture,
    proposed: fixture.proposed,
    worker: fixture.proposed.worker,
    bytes: fixture.proposed.worker.bytes,
    proposalPin: canonicalProposalPin(fixture, fault, 'public'),
    fault,
    mode: 'public',
  });
  return prepared;
}

/** Checks the accepted finite program; only seven named literal roles and the terminal debug comment may vary. */
async function compareCanonicalHandoff(fixture: CanonicalFixture) {
  const syntax = await import('typescript');
  const baseline = '/tmp/puni-b2-finite-worker-audit-20261026/';
  const manifestBytes = await canonicalFs.readFile(baseline + 'review-packet.json');
  if (hash(manifestBytes) !== 'd75ce883d7796759583dfb705cb6656e70429bfaa14d46d3056fd3c1ff18f8ac')
    throw Error('finite audit frozen packet differs');
  const review = JSON.parse(manifestBytes.toString()) as {
    files: { name: string; bytes: number; sha256: string }[];
  };
  const bodies = new Map<string, Buffer>();
  for (const expected of review.files) {
    if (!/^[a-zA-Z0-9.-]+$/.test(expected.name))
      throw Error('finite audit frozen filename differs');
    const path = baseline + expected.name;
    const identity = await canonicalFs.lstat(path, { bigint: true });
    const bytes = await canonicalFs.readFile(path);
    const after = await canonicalFs.lstat(path, { bigint: true });
    if (
      !identity.isFile() ||
      identity.nlink !== 1n ||
      (identity.mode & 4095n) !== 256n ||
      identity.dev !== after.dev ||
      identity.ino !== after.ino ||
      bytes.length !== expected.bytes ||
      hash(bytes) !== expected.sha256
    )
      throw Error('finite audit frozen body differs');
    bodies.set(expected.name, bytes);
  }
  function body(name: string) {
    const bytes = bodies.get(name);
    if (bytes === undefined) throw Error('finite audit body absent');
    return bytes;
  }
  const closure = JSON.parse(
    body('last-worker-input-closure.json').toString(),
  ) as CanonicalFixture['compilation'] & { emittedSha256: string };
  const snapshots = JSON.parse(
    body('last-worker-source-snapshots.json').toString(),
  ) as CanonicalFixture['compilation']['sourceSnapshots'];
  const actual = fixture.compilation;
  if (
    actual.compiler.bun !== closure.compiler.bun ||
    actual.compiler.typescript !== closure.compiler.typescript ||
    actual.compiler.revision !== '38afee6c84fcf48c0edb2466aa4b27d287a59c30'
  )
    throw Error('finite audit recorded compiler differs');
  if (
    JSON.stringify(actual.loaded) !== JSON.stringify(closure.loaded) ||
    actual.loaded.length !== 202 ||
    actual.loaded.reduce((count, module) => count + module.edits.length, 0) !== 27
  )
    throw Error('finite audit source closure differs');
  const order = (rows: typeof actual.resolutions) => rows.map((row) => JSON.stringify(row)).sort();
  if (JSON.stringify(order(actual.resolutions)) !== JSON.stringify(order(closure.resolutions)))
    throw Error('finite audit resolution association differs');
  for (const module of actual.loaded) {
    const old = snapshots.find((snapshot) => snapshot.path === module.path);
    const fresh = actual.sourceSnapshots.find((snapshot) => snapshot.path === module.path);
    if (old === undefined) throw Error('finite audit source body absent');
    if (
      fresh?.original !== old.original ||
      fresh.transformed !== old.transformed ||
      hash(await canonicalFs.readFile(module.path)) !== module.sha256
    )
      throw Error('finite audit source body differs');
    let transformed = fresh.original;
    for (const edit of [...module.edits].sort((left, right) => right.start - left.start)) {
      if (transformed.slice(edit.start, edit.end) !== edit.from || edit.literal !== edit.from)
        throw Error('finite audit primitive span differs');
      transformed = transformed.slice(0, edit.start) + edit.to + transformed.slice(edit.end);
    }
    if (transformed !== fresh.transformed) throw Error('finite audit nonprimitive transformation');
  }
  const source = await canonicalFs.readFile(import.meta.path, 'utf8');
  const parsed = syntax.createSourceFile(
    import.meta.path,
    source,
    syntax.ScriptTarget.Latest,
    true,
  );
  const generator = parsed.statements.find(
    (statement) =>
      syntax.isFunctionDeclaration(statement) && statement.name?.text === 'canonicalWorkerShim',
  );
  // Historical protected generator ea6 remains pinned in packet 242f; format witness f9542e
  // preserves its complete FS/SQLite bytes. Root adoption c6f53c qualifies this current raw pin.
  if (
    generator === undefined ||
    hash(generator.getText(parsed)) !==
      '23694755c3ec803374cbe620b04814f0605c84de93b58d63eba2a8d0a5d74a4d'
  )
    throw Error('finite audit shim generator differs');
  const packageBytes = JSON.stringify(fixture.proposed.migrationPackage);
  if (
    JSON.stringify(actual.buildOptions) !==
    JSON.stringify([
      {
        entrypoints: [import.meta.dir + '/source-stageb-migration-worker.ts'],
        target: 'bun',
        format: 'esm',
        splitting: false,
        minify: false,
        sourcemap: 'external',
        naming: 'source-stageb-migration-worker.[ext]',
        define: { SOURCE_STAGEB_MIGRATION_LITERAL: JSON.stringify(packageBytes) },
        plugins: [],
      },
    ])
  )
    throw Error('finite audit build options differ');
  const bootstrap = await canonicalFs.readFile(
    import.meta.dir + '/source-stageb-fixture-bootstrap.ts',
  );
  if (hash(bootstrap) !== 'c3efe52c4fc9163f2bc496a454438a3a1d5ff5fb1638de51813c2ce06028c8cf')
    throw Error('finite audit fixed build recipe differs');

  const qualifiedDirectory = '/tmp/puni-b2-handoff-comparison-20261026/';
  const qualifiedPacketBytes = await canonicalFs.readFile(qualifiedDirectory + 'packet.json');
  if (
    hash(qualifiedPacketBytes) !==
    'd9ade2c0225207ba57922a2de6b96e87e8e4f9edae20e70838cb7d24a48404f6'
  )
    throw Error('finite audit fresh qualification packet differs');
  const qualifiedPacket = JSON.parse(qualifiedPacketBytes.toString()) as {
    files: { name: string; sha256: string; bytes: number }[];
  };
  const qualifiedBodies = new Map<string, Buffer>();
  for (const name of [
    'finite-handoff.json',
    'finite-handoff-closure.json',
    'finite-handoff-candidate.mjs',
  ]) {
    const expected = qualifiedPacket.files.find((file) => file.name === name);
    const bytes = await canonicalFs.readFile(qualifiedDirectory + name);
    if (expected === undefined) throw Error('finite audit fresh qualification member absent');
    if (hash(bytes) !== expected.sha256 || bytes.length !== expected.bytes)
      throw Error('finite audit fresh qualification body differs');
    qualifiedBodies.set(name, bytes);
  }
  const qualificationBytes = qualifiedBodies.get('finite-handoff.json');
  const qualifiedCandidate = qualifiedBodies.get('finite-handoff-candidate.mjs');
  const qualifiedClosure = qualifiedBodies.get('finite-handoff-closure.json');
  if (
    qualificationBytes === undefined ||
    qualifiedCandidate === undefined ||
    qualifiedClosure === undefined
  )
    throw Error('finite audit fresh qualification absent');
  const qualification = JSON.parse(qualificationBytes.toString()) as {
    candidateSha256: string;
    normalizedSha256: string;
    compiler: { fresh: { sha256: string; revision: string } };
  };
  if (
    qualification.candidateSha256 !==
      '3c038b72208da352db45d2801fe5c151d02073805e87c23c2b378e4fd9198623' ||
    hash(qualifiedCandidate) !== qualification.candidateSha256 ||
    hash(qualifiedClosure) !== '797e14f56e68b2f4db7f067ce6d4b9a8db39a34024608e34f84692adba2208a2' ||
    qualification.normalizedSha256 !==
      '20a78a35ba17647931906fd2bf82ca479cdb629703dac04aa73a137c1f57ec9f' ||
    qualification.compiler.fresh.sha256 !==
      '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235' ||
    qualification.compiler.fresh.revision !== actual.compiler.revision
  )
    throw Error('finite audit qualified compiler policy differs');
  const oldEmitted = body('last-worker-candidate.mjs').toString();
  const emitted = new TextDecoder('utf-8', { fatal: true }).decode(fixture.proposed.worker.bytes);
  function literalPackage(text: string) {
    const tree = syntax.createSourceFile(
      'candidate.mjs',
      text,
      syntax.ScriptTarget.Latest,
      true,
      syntax.ScriptKind.JS,
    );
    const found: SourceMigrationPackage[] = [];
    function visit(node: SyntaxNode) {
      if (
        syntax.isCallExpression(node) &&
        syntax.isIdentifier(node.expression) &&
        node.expression.text === 'decodePackage' &&
        node.arguments.length === 1 &&
        syntax.isStringLiteral(node.arguments[0])
      )
        found.push(JSON.parse(node.arguments[0].text) as SourceMigrationPackage);
      syntax.forEachChild(node, visit);
    }
    visit(tree);
    if (found.length !== 1) throw Error('finite audit package literal cardinality');
    return found[0];
  }
  const oldPackage = literalPackage(oldEmitted);
  const freshPackage = literalPackage(emitted);
  if (JSON.stringify(freshPackage) !== packageBytes)
    throw Error('finite audit compiled package differs');
  if (
    JSON.stringify({
      ...freshPackage,
      sourceSha: oldPackage.sourceSha,
      migrationManifestSha256: oldPackage.migrationManifestSha256,
      envelope: oldPackage.envelope,
    }) !== JSON.stringify(oldPackage)
  )
    throw Error('finite audit fixed package fields differ');
  const proposed = fixture.proposed;
  if (
    freshPackage.sourceSha !== proposed.owned.sha ||
    proposed.prerequisites.activation.owner.sha !== proposed.owned.sha ||
    proposed.prerequisites.activation.source.pins.sourceSha !== proposed.owned.sha ||
    proposed.prerequisites.activation.migrations.sourceSha !== proposed.owned.sha
  )
    throw Error('finite audit original source joins differ');
  const manifest = proposed.owned.artifacts['migration-manifest'];
  const migration = JSON.parse(manifest.toString()) as { sourceSha: string };
  if (
    manifest.toString() !== JSON.stringify(migration) + '\n' ||
    migration.sourceSha !== proposed.owned.sha ||
    hash(manifest) !== freshPackage.migrationManifestSha256 ||
    freshPackage.envelope !== '/home/puni1/wbs/state/dependency-artifacts/' + hash(manifest) ||
    proposed.prerequisites.activation.migrations.manifestSha256 !== hash(manifest)
  )
    throw Error('finite audit original manifest joins differ');
  if (
    hash(JSON.stringify({ ...migration, sourceSha: oldPackage.sourceSha }) + '\n') !==
    oldPackage.migrationManifestSha256
  )
    throw Error('finite audit manifest fields or SQL roster differ');
  const sql = JSON.parse(body('last-worker-finite-sql.json').toString()) as {
    sqlFiles: {
      path: string;
      name: string;
      member: string;
      text: string;
      bytes: number;
      sha256: string;
    }[];
  };
  if (sql.sqlFiles.length !== 4) throw Error('finite audit SQL roster cardinality');
  for (const expected of sql.sqlFiles) {
    const bytes = await canonicalFs.readFile(
      proposed.owned.source + '/apps/wbs/be-01/drizzle/' + expected.name + '/' + expected.member,
    );
    if (
      bytes.length !== expected.bytes ||
      hash(bytes) !== expected.sha256 ||
      bytes.toString() !== expected.text
    )
      throw Error('finite audit SQL bytes differ');
  }
  const inflate = (await import('node:zlib')).inflateSync;
  const gitObjects: { path: string; sha: string; kind: string; payloadBase64: string }[] = [];
  async function gitObject(sourceRoot: string, sha: string) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('finite audit Git identity syntax');
    const path = sourceRoot + '/.git/objects/' + sha.slice(0, 2) + '/' + sha.slice(2);
    const identity = await canonicalFs.lstat(path, { bigint: true });
    if (!identity.isFile() || identity.uid !== BigInt(process.geteuid?.() ?? -1))
      throw Error('finite audit Git object custody');
    const bytes = inflate(await canonicalFs.readFile(path), { maxOutputLength: 16 * 1024 * 1024 });
    if (createHash('sha1').update(bytes).digest('hex') !== sha)
      throw Error('finite audit Git object digest');
    const separator = bytes.indexOf(0);
    const header = bytes.subarray(0, separator).toString();
    const payload = bytes.subarray(separator + 1);
    if (separator < 0 || header !== header.split(' ')[0] + ' ' + String(payload.length))
      throw Error('finite audit Git object size');
    gitObjects.push({
      path,
      sha,
      kind: header.split(' ')[0],
      payloadBase64: payload.toString('base64'),
    });
    return { kind: header.split(' ')[0], payload };
  }
  const oldSource = sql.sqlFiles[0].path.split('/apps/wbs/be-01/drizzle/')[0];
  const oldCommit = await gitObject(oldSource, oldPackage.sourceSha);
  const freshCommit = await gitObject(proposed.owned.source, proposed.owned.sha);
  const tree = (commit: typeof oldCommit) => {
    if (commit.kind !== 'commit') throw Error('finite audit Git commit type');
    const match = /^tree ([a-f0-9]{40})\n/.exec(commit.payload.toString());
    if (match === null) throw Error('finite audit Git tree absent');
    return match[1];
  };
  if (tree(oldCommit) !== tree(freshCommit)) throw Error('finite audit actual source tree differs');
  const head = await canonicalFs.readFile(proposed.owned.source + '/.git/HEAD', 'utf8');
  if (
    !/^ref: refs\/heads\/[a-zA-Z0-9_-]+\n$/.test(head) ||
    (
      await canonicalFs.readFile(proposed.owned.source + '/.git/' + head.trim().slice(5), 'utf8')
    ).trim() !== proposed.owned.sha
  )
    throw Error('finite audit original HEAD differs');
  let trackedFiles = 0;
  const trackedMembers: {
    path: string;
    mode: string;
    blob: string;
    bytes: number;
    sha256: string;
  }[] = [];
  async function gitTree(sha: string, relative = '', depth = 0): Promise<void> {
    if (depth > 24 || trackedFiles > 1024) throw Error('finite audit Git tree exceeds bound');
    const contents = await gitObject(proposed.owned.source, sha);
    if (contents.kind !== 'tree') throw Error('finite audit Git tree type');
    for (let offset = 0; offset < contents.payload.length;) {
      const end = contents.payload.indexOf(0, offset);
      if (end < 0 || end + 21 > contents.payload.length)
        throw Error('finite audit Git tree framing');
      const row = contents.payload.subarray(offset, end).toString();
      const space = row.indexOf(' ');
      const mode = row.slice(0, space);
      const name = row.slice(space + 1);
      const child = contents.payload.subarray(end + 1, end + 21).toString('hex');
      offset = end + 21;
      if (space < 0 || !name || name.includes('/') || name === '.' || name === '..')
        throw Error('finite audit Git tree member');
      const member = relative + name;
      const location = proposed.owned.source + '/' + member;
      const identity = await canonicalFs.lstat(location);
      if (mode === '40000') {
        if (!identity.isDirectory()) throw Error('finite audit source directory type');
        await gitTree(child, member + '/', depth + 1);
      } else {
        if (
          !['100644', '100755'].includes(mode) ||
          !identity.isFile() ||
          (identity.mode & 0o111) !== (mode === '100755' ? 0o111 : 0)
        )
          throw Error('finite audit source file type');
        const bytes = await canonicalFs.readFile(location);
        if (
          createHash('sha1')
            .update('blob ' + String(bytes.length) + '\0')
            .update(bytes)
            .digest('hex') !== child
        )
          throw Error('finite audit actual tracked source differs');
        trackedMembers.push({
          path: member,
          mode,
          blob: child,
          bytes: bytes.length,
          sha256: hash(bytes),
        });
        trackedFiles++;
      }
    }
  }
  await gitTree(tree(freshCommit));
  const baselineTopology = JSON.parse(body('topology-generator-source-pins.json').toString()) as {
    topology: {
      root: string;
      jobRoot: string;
      members: { path: string; kind: string; mode: number }[];
    };
  };
  if (
    !/^\/tmp\/puni-b1-[A-Za-z0-9]+\/constructor-[A-Za-z0-9]+$/.test(proposed.directory) ||
    fixture.modelRoot !== proposed.directory + '/native-model'
  )
    throw Error('finite audit private coordinate differs');
  const topology = [];
  for (const path of [
    proposed.directory.slice(0, proposed.directory.lastIndexOf('/')),
    proposed.directory,
    fixture.modelRoot,
  ]) {
    const identity = await canonicalFs.lstat(path, { bigint: true });
    if (
      !identity.isDirectory() ||
      identity.uid !== BigInt(process.geteuid?.() ?? -1) ||
      identity.gid !== BigInt(process.getegid?.() ?? -1) ||
      (identity.mode & 4095n) !== 448n ||
      (await canonicalFs.realpath(path)) !== path
    )
      throw Error('finite audit private parent custody');
    topology.push({
      path,
      device: String(identity.dev),
      inode: String(identity.ino),
      uid: Number(identity.uid),
      gid: Number(identity.gid),
      mode: Number(identity.mode & 4095n),
    });
  }
  const members: { relative: string; kind: string; mode: number }[] = [];
  async function walk(path: string, depth = 0): Promise<void> {
    if (depth > 24 || members.length > 1024) throw Error('finite audit topology bound');
    const identity = await canonicalFs.lstat(path);
    if (
      !identity.isDirectory() ||
      identity.uid !== process.geteuid?.() ||
      identity.gid !== process.getegid?.()
    )
      throw Error('finite audit preinstall topology type');
    members.push({
      relative: path.slice(fixture.modelRoot.length),
      kind: 'directory',
      mode: identity.mode & 4095,
    });
    for (const name of (await canonicalFs.readdir(path)).sort())
      await walk(path + '/' + name, depth + 1);
  }
  await walk(fixture.modelRoot);
  const byRelative = (rows: typeof members) =>
    rows.sort((left, right) => left.relative.localeCompare(right.relative));
  if (
    JSON.stringify(byRelative(members)) !==
    JSON.stringify(
      byRelative(
        baselineTopology.topology.members.map((member) => ({
          relative: member.path.slice(baselineTopology.topology.root.length),
          kind: member.kind,
          mode: member.mode,
        })),
      ),
    )
  )
    throw Error('finite audit topology shape differs');

  function normalize(text: string, fixed: SourceMigrationPackage, root: string, jobs: string) {
    const parsed = syntax.createSourceFile(
      'candidate.mjs',
      text,
      syntax.ScriptTarget.Latest,
      true,
      syntax.ScriptKind.JS,
    );
    const spans: { role: string; start: number; end: number; value: string }[] = [];
    function add(role: string, start: number, end: number, value: string) {
      if (text.slice(start, end) !== value)
        throw Error('finite audit emitted literal span differs');
      spans.push({ role, start, end, value });
    }
    function visit(node: SyntaxNode) {
      if (
        syntax.isVariableDeclaration(node) &&
        syntax.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        syntax.isStringLiteral(node.initializer)
      ) {
        const role = node.name.text;
        const expected =
          role === 'modelRoot' || role === 'modelRoot2'
            ? root
            : role === 'jobs'
              ? jobs
              : role === 'envelope'
                ? fixed.envelope
                : undefined;
        if (expected !== undefined) {
          if (node.initializer.text !== expected)
            throw Error('finite audit literal coordinate differs');
          add(
            role,
            node.initializer.getStart(parsed),
            node.initializer.end,
            node.initializer.getText(parsed),
          );
        }
      }
      if (
        syntax.isCallExpression(node) &&
        syntax.isIdentifier(node.expression) &&
        node.expression.text === 'decodePackage' &&
        node.arguments.length === 1 &&
        syntax.isStringLiteral(node.arguments[0])
      ) {
        const literal = node.arguments[0];
        const raw = literal.getText(parsed);
        for (const field of ['sourceSha', 'migrationManifestSha256', 'envelope'] as const) {
          const prefix = '"' + field + '":"';
          const token = prefix + fixed[field] + '"';
          const offset = raw.indexOf(token);
          if (offset < 0 || raw.includes(token, offset + 1))
            throw Error('finite audit nested package span differs');
          add(
            'package.' + field,
            literal.getStart(parsed) + offset + prefix.length,
            literal.getStart(parsed) + offset + prefix.length + fixed[field].length,
            fixed[field],
          );
        }
      }
      syntax.forEachChild(node, visit);
    }
    visit(parsed);
    if (
      JSON.stringify(spans.map((span) => span.role).sort()) !==
      JSON.stringify(
        [
          'envelope',
          'jobs',
          'modelRoot',
          'modelRoot2',
          'package.envelope',
          'package.migrationManifestSha256',
          'package.sourceSha',
        ].sort(),
      )
    )
      throw Error('finite audit literal role cardinality');
    const debug = /\n\/\/# debugId=[A-F0-9]{32}\n?$/.exec(text);
    if (debug === null) throw Error('finite audit terminal debug comment differs');
    add('terminal.debugId', debug.index, text.length, debug[0]);
    let normalized = text;
    for (const span of [...spans].sort((left, right) => right.start - left.start))
      normalized =
        normalized.slice(0, span.start) + '<' + span.role + '>' + normalized.slice(span.end);
    return { normalized, spans };
  }
  const before = normalize(
    oldEmitted,
    oldPackage,
    baselineTopology.topology.root,
    baselineTopology.topology.jobRoot,
  );
  const after = normalize(
    emitted,
    freshPackage,
    fixture.modelRoot,
    proposed.directory + '/coordinator/source-stageb-constructor',
  );
  // Proof: canonical pre-I handoff rejects a self-consistent changed executable before original approval/helper creation/dispatch, all independently zero.
  if (
    before.normalized !== after.normalized ||
    hash(after.normalized) !== qualification.normalizedSha256
  )
    throw Error('finite audit emitted mismatch');
  const runtimeIdentity = await canonicalFs.lstat(process.execPath, { bigint: true });
  const runtimeBytes = await canonicalFs.readFile(process.execPath);
  const runtimeAfter = await canonicalFs.lstat(process.execPath, { bigint: true });
  const facility = JSON.parse(proposed.facilityBytes.toString()) as SourceFixtureAuthority;
  if (
    !runtimeIdentity.isFile() ||
    runtimeIdentity.size !== BigInt(runtimeBytes.length) ||
    runtimeIdentity.dev !== runtimeAfter.dev ||
    runtimeIdentity.ino !== runtimeAfter.ino ||
    runtimeIdentity.mtimeNs !== runtimeAfter.mtimeNs ||
    runtimeIdentity.ctimeNs !== runtimeAfter.ctimeNs ||
    hash(runtimeBytes) !== '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235' ||
    facility.runtime.sha256 !== hash(runtimeBytes) ||
    proposed.prerequisites.activation.solver.bunSha256 !== hash(runtimeBytes)
  )
    throw Error('finite audit current compiler unavailable');
  const receipt = {
    status:
      'compared against root-qualified fresh compiler baseline; runtime entry requires separate root GO',
    qualifiedPacketSha256: hash(qualifiedPacketBytes),
    baselinePacketSha256: hash(manifestBytes),
    baselineCandidateSha256: hash(oldEmitted),
    candidateSha256: hash(proposed.worker.bytes),
    normalizedSha256: hash(after.normalized),
    literalSpans: { baseline: before.spans, prepared: after.spans },
    package: freshPackage,
    manifestSha256: hash(manifest),
    source: {
      oldCommit: oldPackage.sourceSha,
      freshCommit: proposed.owned.sha,
      tree: tree(freshCommit),
      trackedFiles,
      trackedMembers,
      gitObjects,
    },
    topology,
    compiler: {
      historical: {
        bun: closure.compiler.bun,
        revision: '38afee6c8 prefix only',
        executableSha256: 'UNKNOWN; not recorded in d75',
      },
      fresh: {
        ...actual.compiler,
        path: process.execPath,
        sha256: hash(runtimeBytes),
        device: String(runtimeIdentity.dev),
        inode: String(runtimeIdentity.ino),
        bytes: runtimeBytes.length,
        mtimeNs: String(runtimeIdentity.mtimeNs),
        ctimeNs: String(runtimeIdentity.ctimeNs),
      },
    },
    buildOptions: actual.buildOptions,
    closure: { modules: actual.loaded.length, resolutions: actual.resolutions.length, edits: 27 },
    dynamicCompilationCorrection:
      'Zod aliases Function as F: fixed trusted generated object parser and empty capability probe. Drizzle FnConstructor paths retained but jit undefined selects default mappers; no blanket absence claim.',
  };
  const receiptPath = proposed.directory + '/finite-handoff.json';
  await canonicalFs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o400 });
  for (const [name, bytes] of [
    ['finite-handoff-candidate.mjs', proposed.worker.bytes],
    ['finite-handoff-closure.json', Buffer.from(JSON.stringify(actual))],
    ['finite-handoff-manifest.json', manifest],
  ] as const)
    await canonicalFs.writeFile(proposed.directory + '/' + name, bytes, { mode: 0o400 });
  await canonicalFs.writeFile(
    '/tmp/puni-b2-public-model-20261026/last-handoff-pointer.json',
    JSON.stringify({ receiptPath, candidateSha256: receipt.candidateSha256 }),
    { mode: 0o600 },
  );
  return { receiptPath };
}

async function runCanonicalPublicModel(fault = '') {
  const prepared = await prepareCanonicalHandoff(fault);
  return await continueCanonicalPublicModel(prepared, fault);
}

async function continueCanonicalPublicModel(
  prepared: CanonicalHandoff,
  fault = '',
  mode: unknown = 'public',
) {
  const retained = canonicalHandoffs.get(prepared);
  if (retained === undefined) throw Error('finite audit handoff already consumed');
  // Proof: omitting this synchronous delete lets the actual overlap/repeat controls reach a second intercepted first write; exact restoration admits one call only.
  canonicalHandoffs.delete(prepared);
  // Proof: independently changing continuation fault/mode refuses before its first write; isolated predicate omissions reach the pre-effect observer instead.
  if (fault !== retained.fault || mode !== retained.mode)
    throw Error('finite audit prepared operation changed');
  // Proof: isolated machine/nativeKernel/owned.sha pin omissions reach the independent first-write observer in their actual continuation negatives; exact restoration refuses before effects.
  if (
    retained.fixture.proposed !== retained.proposed ||
    retained.fixture.proposed.worker !== retained.worker ||
    retained.fixture.proposed.worker.bytes !== retained.bytes ||
    hash(retained.bytes) !== prepared.candidateSha256 ||
    canonicalProposalPin(retained.fixture, retained.fault, retained.mode) !== retained.proposalPin
  )
    throw Error('finite audit retained handoff changed');
  const fixture: CanonicalFixture = retained.fixture;
  await canonicalFs.writeFile(
    fixture.proposed.directory + '/model-policy.json',
    fixture.proposed.facilityBytes,
    { mode: 0o600 },
  );
  await canonicalFs.writeFile(
    fixture.proposed.directory + '/model-native-view.json',
    JSON.stringify(fixture.nativeKernel),
    { mode: 0o600 },
  );
  await canonicalFs.writeFile(
    fixture.proposed.directory + '/model-configuration.json',
    fixture.proposed.owned.artifacts.configuration,
    { mode: 0o600 },
  );
  const compile = Bun.build.bind(Bun);
  const observed = spyOn(Bun, 'build').mockImplementation((options) =>
    compile({
      ...options,
      plugins: [
        ...(options.plugins ?? []),
        {
          name: 'test-only-owned-sqlite-boundary',
          setup(build) {
            build.onLoad(
              { filter: /(?:store-sqlite\/src\/db|source-stageb-fixture)\.ts$/ },
              async (args) => ({
                loader: 'ts',
                contents: (await Bun.file(args.path).text()).replace(
                  "from 'bun:sqlite'",
                  "from 'stageb:model-sqlite'",
                ),
              }),
            );
            build.onResolve({ filter: /^stageb:model-sqlite$/ }, () => ({
              path: 'mapped-sqlite',
              namespace: 'owned-sqlite',
            }));
            build.onResolve({ filter: /^stageb:model-native-sqlite$/ }, () => ({
              path: 'bun:sqlite',
              external: true,
            }));
            build.onLoad({ filter: /.*/, namespace: 'owned-sqlite' }, () => ({
              loader: 'js',
              contents: `import {Database as NativeDatabase,SQLiteError} from 'bun:sqlite';export {SQLiteError};export class Database extends NativeDatabase{constructor(path,options){const map=globalThis[Symbol.for('stageb.test.sqlite.map')];if(typeof map!=='function')throw Error('owned SQLite mapping unavailable before constructor');super(map(path),options);}}`,
            }));
          },
        },
      ],
    }),
  );
  try {
    const observed = await runOwnedConstructionProbe(
      fixture.proposed,
      canonicalRawModelSource(fixture.modelRoot, fixture.machine),
      retained.fault,
      retained.mode,
    );
    await canonicalFs.writeFile(
      '/tmp/puni-b2-public-model-20261026/last-public-evidence.json',
      observed.stdout,
      { mode: 0o600 },
    );
    return observed;
  } finally {
    observed.mockRestore();
  }
}

import * as rawChildBoundary from 'node:child_process';

/** Capability-minimal standalone observer: native targets are fixed literals; no caller operand reaches native IO. */
function canonicalUnderMapSource(allowed: string, key: string, kind: 'fs' | 'sqlite') {
  return kind === 'fs'
    ? `import {constants,existsSync as privateExistsSync} from 'node:fs';const below=globalThis[Symbol.for(${JSON.stringify(key)})];export {constants};export function existsSync(...operands){below('existsSync',operands);return privateExistsSync(${JSON.stringify(allowed)});}export function openSync(...operands){below('openSync',operands);throw Error('under-map operation has no native binding');}export function closeSync(...operands){below('closeSync',operands);throw Error('under-map operation has no native binding');}export function fstatSync(...operands){below('fstatSync',operands);throw Error('under-map operation has no native binding');}export function writeSync(...operands){below('writeSync',operands);throw Error('under-map operation has no native binding');}export function lstatSync(...operands){below('lstatSync',operands);throw Error('under-map operation has no native binding');}export function readdirSync(...operands){below('readdirSync',operands);throw Error('under-map operation has no native binding');}export function readFileSync(...operands){below('readFileSync',operands);throw Error('under-map operation has no native binding');}export function rmSync(...operands){below('rmSync',operands);throw Error('under-map operation has no native binding');}export function mkdtempSync(...operands){below('mkdtempSync',operands);throw Error('under-map operation has no native binding');}export function cpSync(...operands){below('cpSync',operands);throw Error('under-map operation has no native binding');}`
    : `import {Database as PrivateDatabase,SQLiteError} from 'bun:sqlite';export {SQLiteError};const below=globalThis[Symbol.for(${JSON.stringify(key)})];export class Database{#database;constructor(path,options){below('Database',[path]);this.#database=new PrivateDatabase(${JSON.stringify(allowed)},{readonly:true,create:false});}query(sql){if(sql!=='SELECT 1 AS observed'){below('Database.query',[sql]);throw Error('unsupported raw SQL');}const database=this.#database;return Object.freeze({get(){return database.query('SELECT 1 AS observed').get();}});}close(){this.#database.close();}static open(path){below('Database.open',[path]);throw Error('unsupported raw SQLite open');}static deserialize(bytes){below('Database.deserialize',[bytes]);throw Error('unsupported raw SQLite deserialize');}}`;
}

/** Actual shared shim with an independent raw boundary below its decision; no fixed worker entry is imported. */
async function loadCanonicalShimProbe(
  fixture: Awaited<ReturnType<typeof createCanonicalModelFixture>>,
) {
  const key = 'stageb.under-map.' + hash(fixture.proposed.directory);
  const observed: { operation: string; operands: unknown[] }[] = [];
  const allowed = fixture.modelRoot + fixture.proposed.migrationPackage.databases[0].path;
  await canonicalFs.mkdir(join(allowed, '..'), { recursive: true, mode: 0o700 });
  await canonicalFs.writeFile(allowed, '', { mode: 0o600 });
  const context = globalThis as typeof globalThis & Record<symbol, unknown>;
  context[Symbol.for(key)] = (operation: string, operands: unknown[]) => {
    observed.push({ operation, operands });
    if (!['existsSync', 'Database'].includes(operation) || operands[0] !== allowed)
      throw Error('under-map foreign primitive intercepted');
    return undefined;
  };
  const fsSource = canonicalWorkerShim(fixture.proposed, fixture.modelRoot, 'fs');
  const sqliteSource = canonicalWorkerShim(fixture.proposed, fixture.modelRoot, 'sqlite');
  const built = await Bun.build({
    entrypoints: ['stageb:shim-control-entry'],
    target: 'bun',
    format: 'esm',
    plugins: [
      {
        name: 'actual-shim-under-map-control',
        setup(build) {
          build.onResolve({ filter: /^stageb:shim-control-entry$/ }, () => ({
            path: 'entry',
            namespace: 'shim-control',
          }));
          build.onResolve({ filter: /^stageb:shim-control-(fs|sqlite)$/ }, (args) => ({
            path: args.path,
            namespace: 'shim-control',
          }));
          build.onResolve({ filter: /^stageb:observed-native-(fs|sqlite)$/ }, (args) => ({
            path: args.path,
            namespace: 'shim-control',
          }));
          build.onLoad({ filter: /.*/, namespace: 'shim-control' }, (args) => ({
            loader: 'js',
            contents:
              args.path === 'entry'
                ? `export {existsSync,fstatSync,cpSync} from 'stageb:shim-control-fs';export {Database} from 'stageb:shim-control-sqlite';`
                : args.path === 'stageb:shim-control-fs'
                  ? fsSource.replace("from 'node:fs'", "from 'stageb:observed-native-fs'")
                  : args.path === 'stageb:shim-control-sqlite'
                    ? sqliteSource.replace(
                        "from 'bun:sqlite'",
                        "from 'stageb:observed-native-sqlite'",
                      )
                    : args.path === 'stageb:observed-native-fs'
                      ? canonicalUnderMapSource(allowed, key, 'fs')
                      : canonicalUnderMapSource(allowed, key, 'sqlite'),
          }));
        },
      },
    ],
  });
  if (!built.success)
    throw new AggregateError(built.logs, 'standalone same-shim compilation refused');
  const entry = built.outputs.find((output) => output.kind === 'entry-point');
  if (entry === undefined) throw Error('standalone same-shim entry absent');
  const bytes = new Uint8Array(await entry.arrayBuffer());
  const path = fixture.proposed.directory + '/same-shim-control.mjs';
  await canonicalFs.writeFile(path, bytes, { mode: 0o600 });
  const probe = (await import(path)) as {
    existsSync: (path: unknown) => boolean;
    fstatSync: (fd: number) => unknown;
    cpSync: (from: string, to: string) => void;
    Database: {
      new (path: string, options?: unknown): Database;
      open: (path: string) => Database;
      deserialize: (bytes: Uint8Array) => Database;
    };
  };
  return {
    probe,
    observed,
    allowed,
    fsSha256: hash(fsSource),
    sqliteSha256: hash(sqliteSource),
    emittedSha256: hash(bytes),
    close() {
      Reflect.deleteProperty(context, Symbol.for(key));
    },
  };
}

test('canonical same shim refuses foreign paths suffix descriptors and copy operands before raw calls', async () => {
  const fixture = await createCanonicalModelFixture();
  const shim = await loadCanonicalShimProbe(fixture);
  const canonical = fixture.proposed.migrationPackage.databases[0].path;
  const foreign = fixture.proposed.directory + '/foreign-sentinel';
  await canonicalFs.writeFile(foreign, 'foreign-preserved', { mode: 0o600 });
  try {
    for (const invoke of [
      () => shim.probe.existsSync(foreign),
      () => shim.probe.existsSync(canonical + '-foreign'),
      () => shim.probe.fstatSync(0),
      () => {
        shim.probe.cpSync(canonical, foreign);
      },
      () => shim.probe.existsSync(0),
      () => new shim.probe.Database(foreign),
      () => shim.probe.Database.open(foreign),
      () => shim.probe.Database.deserialize(new Uint8Array()),
    ]) {
      expect(invoke).toThrow();
      expect(shim.observed).toHaveLength(0);
    }
    expect(shim.probe.existsSync(canonical)).toBe(true);
    expect(shim.observed).toEqual([{ operation: 'existsSync', operands: [shim.allowed] }]);
    shim.observed.length = 0;
    const database = new shim.probe.Database(canonical, { readonly: true, create: false });
    try {
      expect(database.query('SELECT 1 AS observed').get()).toEqual({ observed: 1 });
      expect(shim.observed).toEqual([{ operation: 'Database', operands: [shim.allowed] }]);
    } finally {
      database.close();
    }
    expect(await canonicalFs.readFile(foreign, 'utf8')).toBe('foreign-preserved');
    await canonicalFs.writeFile(
      '/tmp/puni-b2-public-model-20261026/same-shim-under-map-receipt.json',
      JSON.stringify({
        fsSha256: shim.fsSha256,
        sqliteSha256: shim.sqliteSha256,
        emittedSha256: shim.emittedSha256,
        rejected: 8,
        positiveRawCalls: 2,
        observed: shim.observed,
      }),
      { mode: 0o600 },
    );
  } finally {
    shim.close();
  }
}, 30000);

test('canonical candidate refuses an unbound primitive before original approval and helper dispatch', async () => {
  const write = canonicalFs.writeFile.bind(canonicalFs);
  const spawn = rawChildBoundary.spawn.bind(rawChildBoundary);
  const counters = {
    approvalWrites: 0,
    helperCreations: 0,
    candidateChildren: 0,
    workerChildren: 0,
  };
  const writes = spyOn(canonicalFs, 'writeFile').mockImplementation((path, ...args) => {
    if (typeof path === 'string' && path.endsWith('/lower.mjs')) {
      counters.helperCreations++;
      throw Error('test unexpected helper creation intercepted before write');
    }
    if (typeof path === 'string' && path.endsWith('/index')) {
      counters.approvalWrites++;
      throw Error('test unexpected approval intercepted before write');
    }
    return Reflect.apply(write, canonicalFs, [path, ...args]);
  });
  // Test boundary: every overload forwards its original argument vector unchanged to the captured native spawn.
  const observeSpawn = ((...args: unknown[]) => {
    const argv = args[1];
    if (Array.isArray(argv)) {
      if (
        argv.some((argument) => typeof argument === 'string' && argument.endsWith('/lower.mjs'))
      ) {
        counters.candidateChildren++;
        throw Error('test unexpected candidate dispatch intercepted before entry');
      }
      if (
        argv.some(
          (argument) => typeof argument === 'string' && argument.endsWith('/migration-worker.mjs'),
        )
      ) {
        counters.workerChildren++;
        throw Error('test unexpected worker dispatch intercepted before entry');
      }
    }
    return Reflect.apply(spawn, rawChildBoundary, args) as ReturnType<
      typeof rawChildBoundary.spawn
    >;
  }) as typeof rawChildBoundary.spawn;
  const children = spyOn(rawChildBoundary, 'spawn').mockImplementation(observeSpawn);
  let caught: unknown;
  try {
    await runCanonicalPublicModel('unbound-primitive');
  } catch (cause) {
    caught = cause;
  } finally {
    children.mockRestore();
    writes.mockRestore();
  }
  function labels(cause: unknown): string[] {
    if (typeof cause !== 'object' || cause === null) return [String(cause)];
    const current = 'message' in cause ? String(cause.message) : '';
    const nested = cause instanceof AggregateError ? cause.errors.flatMap(labels) : [];
    return [current, ...nested];
  }
  expect(labels(caught)).toContain('owned worker unbound primitive load refused');
  expect(counters).toEqual({
    approvalWrites: 0,
    helperCreations: 0,
    candidateChildren: 0,
    workerChildren: 0,
  });
  await canonicalFs.writeFile(
    '/tmp/puni-b2-public-model-20261026/unbound-preapproval-receipt.json',
    JSON.stringify({ labels: labels(caught), counters }),
    { mode: 0o600 },
  );
}, 30000);

/** Independent raw observers refuse the first continuation write and all later approval/helper/dispatch boundaries. */
async function observeCanonicalPreI(
  action: (controls: { releaseFirstEffect: () => void }) => Promise<unknown>,
  holdFirstEffect = false,
) {
  const write = canonicalFs.writeFile.bind(canonicalFs);
  const spawn = rawChildBoundary.spawn.bind(rawChildBoundary);
  const counters = {
    approvalWrites: 0,
    helperCreations: 0,
    candidateChildren: 0,
    workerChildren: 0,
  };
  let firstEffectWrites = 0;
  let firstEffectPath: string | undefined;
  const held: Promise<unknown>[] = [];
  const releases: (() => void)[] = [];
  const releaseFirstEffect = () => {
    for (const release of releases.splice(0)) release();
  };
  const files = spyOn(canonicalFs, 'writeFile').mockImplementation((path, ...args) => {
    if (
      typeof path === 'string' &&
      /^\/tmp\/puni-b1-[A-Za-z0-9]+\/constructor-[A-Za-z0-9]+\/finite-handoff\.json$/.test(path)
    )
      firstEffectPath = path.slice(0, -'finite-handoff.json'.length) + 'model-policy.json';
    if (typeof path === 'string' && path.endsWith('/model-policy.json')) {
      if (path !== firstEffectPath)
        throw Error('test unregistered continuation first-effect coordinate');
      firstEffectWrites++;
      if (holdFirstEffect && firstEffectWrites === 1) {
        const pending = new Promise<never>((_resolve, reject) => {
          releases.push(() => {
            reject(Error('test admitted first effect intercepted before write'));
          });
        });
        void pending.catch(() => undefined);
        held.push(pending);
        return pending;
      }
      return Promise.reject(Error('test admitted first effect intercepted before write'));
    }
    if (typeof path === 'string' && path.endsWith('/index')) {
      counters.approvalWrites++;
      throw Error('test unexpected approval before write');
    }
    if (typeof path === 'string' && path.endsWith('/lower.mjs')) {
      counters.helperCreations++;
      throw Error('test unexpected helper before write');
    }
    return Reflect.apply(write, canonicalFs, [path, ...args]);
  });
  const observeSpawn = ((...args: unknown[]) => {
    const argv = args[1];
    if (Array.isArray(argv)) {
      if (
        argv.some((argument) => typeof argument === 'string' && argument.endsWith('/lower.mjs'))
      ) {
        counters.candidateChildren++;
        throw Error('test unexpected candidate before spawn');
      }
      if (
        argv.some(
          (argument) => typeof argument === 'string' && argument.endsWith('/migration-worker.mjs'),
        )
      ) {
        counters.workerChildren++;
        throw Error('test unexpected worker before spawn');
      }
    }
    return Reflect.apply(spawn, rawChildBoundary, args) as ReturnType<
      typeof rawChildBoundary.spawn
    >;
  }) as typeof rawChildBoundary.spawn;
  const children = spyOn(rawChildBoundary, 'spawn').mockImplementation(observeSpawn);
  let value: unknown;
  let cause: unknown;
  try {
    value = await action({ releaseFirstEffect });
  } catch (failure) {
    cause = failure;
  } finally {
    releaseFirstEffect();
    await Promise.allSettled(held);
    children.mockRestore();
    files.mockRestore();
  }
  return { value, cause, counters, firstEffectWrites, heldSettled: held.length };
}

test('canonical pre-I handoff retains an equivalent candidate and stops actual continuation before its first effect', async () => {
  let prepared: CanonicalHandoff | undefined;
  const observed = await observeCanonicalPreI(async () => {
    prepared = await prepareCanonicalHandoff();
    const retained = canonicalHandoffs.get(prepared);
    if (retained === undefined) throw Error('test prepared handoff absent');
    expect(retained.bytes).toBe(retained.fixture.proposed.worker.bytes);
    expect(hash(retained.bytes)).toBe(prepared.candidateSha256);
    await continueCanonicalPublicModel(prepared);
  });
  expect(observed.cause).toBeInstanceOf(Error);
  expect((observed.cause as Error).message).toBe(
    'test admitted first effect intercepted before write',
  );
  expect(observed.firstEffectWrites).toBe(1);
  expect(canonicalHandoffs.has(prepared!)).toBe(false);
  expect(observed.counters).toEqual({
    approvalWrites: 0,
    helperCreations: 0,
    candidateChildren: 0,
    workerChildren: 0,
  });
  await canonicalFs.writeFile(
    '/tmp/puni-b2-handoff-continuation-20261026/positive-receipt.json',
    JSON.stringify({
      prepared,
      counters: observed.counters,
      firstEffectWrites: observed.firstEffectWrites,
      refusal: (observed.cause as Error).message,
    }),
    { mode: 0o600 },
  );
}, 30000);

for (const fault of ['machine', 'nativeKernel', 'owned.sha', 'fault', 'mode'] as const)
  test(`canonical pre-I continuation rejects changed ${fault} and permanently spends the handoff`, async () => {
    let prepared: CanonicalHandoff | undefined;
    const observed = await observeCanonicalPreI(async () => {
      prepared = await prepareCanonicalHandoff();
      const retained = canonicalHandoffs.get(prepared);
      if (retained === undefined) throw Error('test prepared handoff absent');
      if (fault === 'machine') retained.fixture.machine = 'b'.repeat(32);
      if (fault === 'nativeKernel') retained.fixture.nativeKernel.manager.startTicks += '1';
      if (fault === 'owned.sha') retained.fixture.proposed.owned.sha = '0'.repeat(40);
      await continueCanonicalPublicModel(
        prepared,
        fault === 'fault' ? 'k3' : '',
        fault === 'mode' ? 'lower' : 'public',
      );
    });
    expect(observed.cause).toBeInstanceOf(Error);
    expect((observed.cause as Error).message).toBe(
      fault === 'fault' || fault === 'mode'
        ? 'finite audit prepared operation changed'
        : 'finite audit retained handoff changed',
    );
    expect(observed.firstEffectWrites).toBe(0);
    expect(canonicalHandoffs.has(prepared!)).toBe(false);
    expect(observed.counters).toEqual({
      approvalWrites: 0,
      helperCreations: 0,
      candidateChildren: 0,
      workerChildren: 0,
    });
    await canonicalFs.writeFile(
      '/tmp/puni-b2-handoff-continuation-20261026/mutation-' + fault + '.json',
      JSON.stringify({
        fault,
        counters: observed.counters,
        firstEffectWrites: observed.firstEffectWrites,
        refusal: (observed.cause as Error).message,
        spent: !canonicalHandoffs.has(prepared!),
      }),
      { mode: 0o600 },
    );
  }, 30000);

for (const timing of ['repeat', 'overlap'] as const)
  test(`canonical pre-I continuation refuses ${timing} use and joins the intercepted first call`, async () => {
    let prepared: CanonicalHandoff | undefined;
    const observed = await observeCanonicalPreI(async ({ releaseFirstEffect }) => {
      prepared = await prepareCanonicalHandoff();
      const first = continueCanonicalPublicModel(prepared).then(
        () => ({ message: 'unexpected success' }),
        (cause: unknown) => ({ message: cause instanceof Error ? cause.message : String(cause) }),
      );
      if (timing === 'repeat') {
        releaseFirstEffect();
        expect(await first).toEqual({
          message: 'test admitted first effect intercepted before write',
        });
      }
      async function requireConsumed() {
        const refusal = await continueCanonicalPublicModel(prepared!).then(
          () => undefined,
          (cause: unknown) => cause,
        );
        expect(refusal).toBeInstanceOf(Error);
        expect((refusal as Error).message).toBe('finite audit handoff already consumed');
      }
      try {
        await requireConsumed();
      } finally {
        releaseFirstEffect();
        expect(await first).toEqual({
          message: 'test admitted first effect intercepted before write',
        });
      }
      await requireConsumed();
    }, true);
    expect(observed.cause).toBeUndefined();
    expect(observed.firstEffectWrites).toBe(1);
    expect(observed.heldSettled).toBe(1);
    expect(canonicalHandoffs.has(prepared!)).toBe(false);
    expect(observed.counters).toEqual({
      approvalWrites: 0,
      helperCreations: 0,
      candidateChildren: 0,
      workerChildren: 0,
    });
    await canonicalFs.writeFile(
      '/tmp/puni-b2-handoff-continuation-20261026/' + timing + '-receipt.json',
      JSON.stringify({
        timing,
        counters: observed.counters,
        firstEffectWrites: observed.firstEffectWrites,
        heldSettled: observed.heldSettled,
        spent: !canonicalHandoffs.has(prepared!),
      }),
      { mode: 0o600 },
    );
  }, 30000);

test('canonical pre-I handoff rejects a recommitted executable mismatch before approval helper and dispatch', async () => {
  const observed = await observeCanonicalPreI(() =>
    prepareCanonicalHandoff('handoff-byte-mismatch'),
  );
  expect(observed.cause).toBeInstanceOf(Error);
  expect((observed.cause as Error).message).toBe('finite audit emitted mismatch');
  expect(observed.counters).toEqual({
    approvalWrites: 0,
    helperCreations: 0,
    candidateChildren: 0,
    workerChildren: 0,
  });
  await canonicalFs.writeFile(
    '/tmp/puni-b2-public-model-20261026/handoff-mismatch-receipt.json',
    JSON.stringify({ refusal: (observed.cause as Error).message, counters: observed.counters }),
    { mode: 0o600 },
  );
}, 30000);

interface RawLifetimeSnapshot {
  status?: { code: number | null; signal: string | null };
  stdout: { eof: boolean; closed: boolean; bytes: number; overflow: boolean; readFailed: boolean };
  stderr: { eof: boolean; closed: boolean; bytes: number; overflow: boolean; readFailed: boolean };
  failures: string[];
  signals: string[];
}
interface RawChildLifetime {
  assertForward(): void;
  retain(
    child: rawChildBoundary.ChildProcessWithoutNullStreams,
    stdoutMaximum: number,
    stderrMaximum: number,
  ): unknown;
  signal(child: rawChildBoundary.ChildProcessWithoutNullStreams, signal?: string): boolean;
  finish(): Promise<{ settled: boolean; expired: boolean; failures: Error[]; retained: unknown[] }>;
  assertRelease(): void;
  snapshot(): RawLifetimeSnapshot[];
}

/** Only this control's admitted real child and TERM/KILL can reach the captured native cancellation. */
async function withRawLifetimeChild(
  mode:
    | 'cooperative'
    | 'overflow'
    | 'held-reader'
    | 'held-stderr'
    | 'closed-pipes'
    | 'reader-acquisition'
    | 'cancel-failure'
    | 'code-one',
  action: (control: {
    child: rawChildBoundary.ChildProcessWithoutNullStreams;
    lifetime: RawChildLifetime;
    physical: { closed: boolean; stdoutEof: boolean; stderrEof: boolean };
    exited: Promise<void>;
    pipesEnded: Promise<void>;
    joined: Promise<void>;
    lowerAttempts: { owned: boolean; signal: string }[];
    deadlineNs: bigint;
    directory: string;
    releaseHeldReader: () => void;
    isReaderHeld: () => boolean;
  }) => Promise<void>,
  milliseconds = 2500,
) {
  const directory = mkdtempSync('/tmp/puni-raw-lifetime-');
  chmodSync(directory, 0o700);
  const enclosingCutoffNs = process.hrtime.bigint() + 3_000_000_000n;
  const deadlineNs = process.hrtime.bigint() + BigInt(milliseconds) * 1_000_000n;
  const admitted = new Set<rawChildBoundary.ChildProcessWithoutNullStreams>();
  const lowerAttempts: { owned: boolean; signal: string }[] = [];
  const nativeKill = Object.getOwnPropertyDescriptor(
    rawChildBoundary.ChildProcess.prototype,
    'kill',
  )?.value as ((signal?: NodeJS.Signals) => boolean) | undefined;
  if (typeof nativeKill !== 'function') throw Error('original native child cancellation absent');
  // Trusted fixed generated test function only; never imports a worker, model entry or test module.
  const create = (
    (await import(
      'data:text/javascript;base64,' +
        Buffer.from(canonicalChildLifetimeSource() + '\nexport {createRawChildLifetime};').toString(
          'base64',
        )
    )) as { createRawChildLifetime: unknown }
  ).createRawChildLifetime as (
    cutoff: bigint,
    wall: number,
    cancel: (child: rawChildBoundary.ChildProcessWithoutNullStreams, signal: string) => boolean,
    sample: () => bigint,
    recordUnproved: (cause: unknown) => void,
  ) => RawChildLifetime;
  const lifetime = create(
    deadlineNs,
    Date.now() + milliseconds,
    (child, signal) => {
      const owned = admitted.has(child);
      lowerAttempts.push({ owned, signal });
      if (!owned || !['SIGTERM', 'SIGKILL'].includes(signal))
        throw Error('restricted original-child cancellation refused');
      if (mode === 'cancel-failure') throw Error('injected original cancellation failure');
      return nativeKill.call(child, signal as NodeJS.Signals);
    },
    () => process.hrtime.bigint(),
    () => undefined,
  );
  const script =
    mode === 'code-one'
      ? "process.stdout.write('ready\\n');process.stderr.write('expected typed missing fixture reply\\n');setTimeout(()=>process.exit(1),10);"
      : mode === 'closed-pipes'
        ? "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),60));process.stdout.end('ready\\n');process.stderr.end('closed\\n');process.stdin.resume();setTimeout(()=>process.exit(0),1000);"
        : mode === 'overflow'
          ? "process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),40));process.stdout.write('ready\\n');process.stdout.write(Buffer.alloc(131072,120));setTimeout(()=>process.exit(0),1000);"
          : "process.on('SIGTERM',()=>setTimeout(()=>{process.stdout.write('done\\n');process.stderr.write('done\\n');process.exit(0);},60));process.stdin.on('data',()=>{process.stdout.write('done\\n');process.stderr.write('done\\n');process.exit(0);});process.stdout.write('ready\\n');setTimeout(()=>process.exit(0),1000);";
  lifetime.assertForward();
  const child = rawChildBoundary.spawn(process.execPath, ['--no-env-file', '-e', script], {
    cwd: directory,
    env: { WBS_ENV: 'dev', TMPDIR: directory, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  admitted.add(child);
  const physical = { closed: false, stdoutEof: false, stderrEof: false };
  let markReady: () => void = () => {
    throw Error('control readiness absent');
  };
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  child.stdout.on('data', () => {
    markReady();
  });
  child.stdout.once('end', () => {
    physical.stdoutEof = true;
  });
  child.stderr.once('end', () => {
    physical.stderrEof = true;
  });
  const pipesEnded = Promise.all([
    new Promise<void>((resolve) => {
      child.stdout.once('end', () => {
        resolve();
      });
    }),
    new Promise<void>((resolve) => {
      child.stderr.once('end', () => {
        resolve();
      });
    }),
  ]).then(() => undefined);
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
  });
  const joined = new Promise<void>((resolve) => {
    child.once('close', () => {
      physical.closed = true;
      resolve();
    });
  });
  child.on('error', () => undefined);
  let heldReader: (() => void) | undefined;
  const heldStream = mode === 'held-stderr' ? child.stderr : child.stdout;
  const originalOnce = heldStream.once.bind(heldStream);
  if (mode === 'held-reader' || mode === 'held-stderr')
    heldStream.once = ((event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'end')
        return originalOnce.call(heldStream, event, (...args: unknown[]) => {
          heldReader = () => {
            listener(...args);
          };
        });
      return originalOnce.call(heldStream, event, listener);
    }) as typeof heldStream.once;
  const originalOn = child.stdout.on.bind(child.stdout);
  if (mode === 'reader-acquisition')
    child.stdout.on = ((event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'data') throw Error('injected actual reader acquisition failure');
      return originalOn.call(child.stdout, event, listener);
    }) as typeof child.stdout.on;
  try {
    lifetime.retain(child, mode === 'overflow' ? 1024 : 65536, 65536);
  } finally {
    heldStream.once = originalOnce;
    child.stdout.on = originalOn;
  }
  const releaseHeldReader = () => {
    const original = heldReader;
    heldReader = undefined;
    original?.();
  };

  async function bounded(promise: Promise<unknown>) {
    const remaining = Number(enclosingCutoffNs - process.hrtime.bigint()) / 1e6;
    if (remaining <= 0) throw Error('inert control enclosing cutoff');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(Error('inert control enclosing cutoff'));
          }, remaining);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  let primary: unknown;
  let beforeCleanup: unknown;
  try {
    await bounded(mode === 'reader-acquisition' ? joined : ready);
    await action({
      child,
      lifetime,
      physical,
      exited,
      pipesEnded,
      joined,
      lowerAttempts,
      deadlineNs,
      directory,
      releaseHeldReader,
      isReaderHeld: () => heldReader !== undefined,
    });
  } catch (cause) {
    primary = cause;
  }
  {
    beforeCleanup = {
      physical: { ...physical },
      snapshot: lifetime.snapshot(),
      lowerAttempts: [...lowerAttempts],
      primary:
        primary instanceof Error
          ? primary.message
          : primary === undefined
            ? undefined
            : typeof primary === 'string'
              ? primary
              : 'non-Error primary retained',
    };
    child.stdout.resume();
    child.stderr.resume();
    if (!physical.closed && child.exitCode === null && child.signalCode === null)
      nativeKill.call(child, 'SIGTERM');
    await bounded(joined);
    if (!physical.closed || !physical.stdoutEof || !physical.stderrEof)
      throw new AggregateError(
        [primary, Error('inert control native close/EOF unresolved')],
        'control resources retained',
      );
    releaseHeldReader();
    lifetime.assertRelease();
    rmSync(directory, { recursive: true });
    await canonicalFs.writeFile(
      '/tmp/puni-b2-outer-lifetime-20261026/last-control-observation.json',
      JSON.stringify({
        mode,
        pid: child.pid,
        beforeCleanup,
        afterCleanup: {
          physical: { ...physical },
          snapshot: lifetime.snapshot(),
          directoryRemoved: true,
        },
        cutoffNs: String(deadlineNs),
        enclosingCutoffNs: String(enclosingCutoffNs),
      }),
      { mode: 0o600 },
    );
  }
  if (primary !== undefined)
    throw primary instanceof Error
      ? primary
      : new AggregateError([primary], 'original control failure');
}

for (const notification of ['child-error', 'reader-error'] as const)
  test(`canonical outer lifetime ${notification} cannot release before actual terminal and both EOF`, async () => {
    await withRawLifetimeChild('cooperative', async ({ child, lifetime, physical, joined }) => {
      if (notification === 'child-error')
        child.emit('error', Error('injected pre-close child notification'));
      else child.stdout.emit('error', Error('injected actual pipe reader notification'));
      expect(physical.closed).toBe(false);
      expect(() => {
        lifetime.assertRelease();
      }).toThrow('raw child settlement retained');
      expect(lifetime.snapshot()[0].stdout.eof).toBe(false);
      await joined;
      expect(physical).toEqual({ closed: true, stdoutEof: true, stderrEof: true });
      const observed = await lifetime.finish();
      expect(observed.settled).toBe(true);
      expect(observed.failures.length).toBeGreaterThan(0);
      expect(
        observed.failures.some(
          (failure) =>
            failure.message ===
            (notification === 'child-error'
              ? 'injected pre-close child notification'
              : 'injected actual pipe reader notification'),
        ),
      ).toBe(true);
      lifetime.assertRelease();
    });
  }, 10000);

test('canonical outer lifetime preserves primary and original cancellation failures after real settlement', async () => {
  await withRawLifetimeChild('cancel-failure', async ({ child, lifetime, joined }) => {
    child.emit('error', Error('injected primary child failure'));
    await joined;
    const observed = await lifetime.finish();
    expect(observed.settled).toBe(true);
    expect(observed.failures.map((failure) => failure.message)).toContain(
      'injected primary child failure',
    );
    expect(observed.failures.map((failure) => failure.message)).toContain(
      'injected original cancellation failure',
    );
  });
}, 10000);

test('canonical outer lifetime records intentional code one as settled terminal data', async () => {
  await withRawLifetimeChild('code-one', async ({ lifetime, physical, joined }) => {
    await joined;
    const observed = await lifetime.finish();
    expect(observed.settled).toBe(true);
    expect(observed.failures).toEqual([]);
    expect(lifetime.snapshot()[0].status).toEqual({ code: 1, signal: null });
    expect(physical).toEqual({ closed: true, stdoutEof: true, stderrEof: true });
  });
}, 10000);

test('canonical outer lifetime reader acquisition failure retains failure and still observes both real EOF', async () => {
  await withRawLifetimeChild('reader-acquisition', async ({ lifetime, physical, joined }) => {
    await joined;
    const observed = await lifetime.finish();
    expect(physical).toEqual({ closed: true, stdoutEof: true, stderrEof: true });
    expect(observed.settled).toBe(true);
    expect(lifetime.snapshot()[0].stdout.readFailed).toBe(true);
    expect(
      observed.failures.some(
        (failure) => failure.message === 'injected actual reader acquisition failure',
      ),
    ).toBe(true);
  });
}, 10000);

test('canonical outer lifetime output overflow cancels original child and drains both real pipes', async () => {
  await withRawLifetimeChild('overflow', async ({ lifetime, physical, joined, lowerAttempts }) => {
    await joined;
    const observed = await lifetime.finish();
    expect(observed.settled).toBe(true);
    expect(physical).toEqual({ closed: true, stdoutEof: true, stderrEof: true });
    expect(lifetime.snapshot()[0].stdout.overflow).toBe(true);
    expect(
      observed.failures.some((failure) => failure.message === 'raw child stdout output bound'),
    ).toBe(true);
    expect(lowerAttempts).toEqual([{ owned: true, signal: 'SIGTERM' }]);
  });
}, 10000);

for (const pipe of ['stdout', 'stderr'] as const)
  test(`canonical outer lifetime held ${pipe} reader prevents release until the same pipe resumes`, async () => {
    await withRawLifetimeChild(
      pipe === 'stdout' ? 'held-reader' : 'held-stderr',
      async ({ child, lifetime, physical, joined, releaseHeldReader, isReaderHeld }) => {
        child.stdin.end('finish');
        await joined;
        expect(physical).toEqual({ closed: true, stdoutEof: true, stderrEof: true });
        expect(isReaderHeld()).toBe(true);
        let cleanupAttempts = 0;
        let cleaned = 0;
        function cleanup() {
          lifetime.assertRelease();
          cleanupAttempts++;
          if (!physical.closed || !physical.stdoutEof || !physical.stderrEof || isReaderHeld())
            throw Error('independent cleanup boundary retained actual reader');
          cleaned++;
        }
        expect(() => {
          cleanup();
        }).toThrow('raw child settlement retained');
        expect(cleanupAttempts).toBe(0);
        expect(cleaned).toBe(0);
        releaseHeldReader();
        await lifetime.finish();
        cleanup();
        expect(cleaned).toBe(1);
      },
    );
  }, 10000);

test('canonical outer lifetime actual EOF cannot replace original child close', async () => {
  await withRawLifetimeChild(
    'closed-pipes',
    async ({ child, lifetime, physical, pipesEnded, joined }) => {
      await pipesEnded;
      expect(physical.stdoutEof && physical.stderrEof).toBe(true);
      expect(physical.closed).toBe(false);
      let cleanupAttempts = 0;
      function cleanup() {
        lifetime.assertRelease();
        cleanupAttempts++;
        if (!physical.closed) throw Error('independent cleanup boundary retained actual child');
      }
      expect(() => {
        cleanup();
      }).toThrow('raw child settlement retained');
      expect(cleanupAttempts).toBe(0);
      child.emit('error', Error('notification after pipes EOF is not child close'));
      expect(() => {
        cleanup();
      }).toThrow('raw child settlement retained');
      await joined;
      await lifetime.finish();
      cleanup();
      expect(cleanupAttempts).toBe(1);
    },
  );
}, 10000);

test('canonical outer lifetime original cutoff refuses later effects without refreshed settlement budget', async () => {
  await withRawLifetimeChild(
    'cooperative',
    async ({ lifetime, joined, deadlineNs }) => {
      const remaining = Number(deadlineNs - process.hrtime.bigint()) / 1e6;
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, remaining + 2)));
      expect(() => {
        lifetime.assertForward();
      }).toThrow('raw child forward cutoff');
      const observed = await lifetime.finish();
      expect(observed.expired).toBe(true);
      expect(observed.settled).toBe(false);
      expect(observed.retained).toHaveLength(1);
      expect(() => {
        lifetime.assertRelease();
      }).toThrow('raw child settlement retained');
      await joined;
      lifetime.assertRelease();
      expect(lifetime.snapshot()[0].failures).toContain('raw child original cutoff exceeded');
    },
    200,
  );
}, 10000);

test('canonical outer lifetime cancellation requires the admitted native child reference', async () => {
  await withRawLifetimeChild('cooperative', async ({ child, lifetime, joined, lowerAttempts }) => {
    const foreign = { pid: 2147483000 } as rawChildBoundary.ChildProcessWithoutNullStreams;
    expect(() => lifetime.signal(foreign, 'SIGKILL')).toThrow(
      'raw child original reference absent',
    );
    expect(lowerAttempts).toHaveLength(0);
    expect(() => lifetime.signal(child, 'SIGSTOP')).toThrow(
      'raw child cancellation signal refused',
    );
    expect(lowerAttempts).toHaveLength(0);
    lifetime.signal(child, 'SIGTERM');
    lifetime.signal(child, 'SIGTERM');
    await joined;
    await lifetime.finish();
    expect(lowerAttempts).toEqual([{ owned: true, signal: 'SIGTERM' }]);
  });
}, 10000);

interface RawAcquisitionLifetime {
  retainFile(file: Awaited<ReturnType<typeof canonicalFs.open>>): unknown;
  retainReader(reader: Awaited<ReturnType<typeof canonicalFs.opendir>>): unknown;
  assertRelease(): void;
  hasRetained(): boolean;
  records: Map<unknown, unknown>;
  failures: unknown[];
}

/** Independently checks the original owned handle before any control filesystem teardown. */
async function withRawAcquisition(
  fault: 'post-acquire' | 'unproved-close' | 'reader',
  action: (control: {
    tracker: RawAcquisitionLifetime;
    closeOwned: () => Promise<void>;
    isOpen: () => Promise<boolean>;
    attemptCleanup: () => Promise<void>;
    cleanupAttempts: () => number;
  }) => Promise<void>,
) {
  const directory = mkdtempSync('/tmp/puni-raw-acquisition-');
  chmodSync(directory, 0o700);
  const enclosingCutoffNs = process.hrtime.bigint() + 3_000_000_000n;
  const create = (
    (await import(
      'data:text/javascript;base64,' +
        Buffer.from(
          canonicalChildLifetimeSource() + '\nexport {createRawAcquisitionLifetime};',
        ).toString('base64')
    )) as { createRawAcquisitionLifetime: unknown }
  ).createRawAcquisitionLifetime as (
    onUnproved: (cause: unknown, references: readonly unknown[]) => unknown,
    assertUsable: () => void,
  ) => RawAcquisitionLifetime;
  const tracker = create(
    (cause) => cause,
    () => undefined,
  );
  const file = await canonicalFs.open(directory + '/owned', 'wx+', 0o600);
  const originalClose = file.close.bind(file);
  const originalStat = file.stat.bind(file);
  const reader = fault === 'reader' ? await canonicalFs.opendir(directory) : undefined;
  const originalReaderClose = reader?.close.bind(reader);
  let cleanupCount = 0;
  let readerClosed = false;
  async function isOpen() {
    try {
      await originalStat();
      return true;
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'EBADF') return false;
      throw cause;
    }
  }
  async function closeOwned() {
    if (process.hrtime.bigint() >= enclosingCutoffNs)
      throw Error('owned acquisition original cutoff');
    file.close = originalClose;
    tracker.retainFile(file);
    await file.close();
    if (reader !== undefined && originalReaderClose !== undefined && !readerClosed) {
      reader.close = originalReaderClose;
      tracker.retainReader(reader);
      await reader.close();
      readerClosed = true;
    }
  }
  async function attemptCleanup() {
    tracker.assertRelease();
    cleanupCount++;
    if (await isOpen()) throw Error('independent acquisition boundary original FD remains open');
  }
  let primary: unknown;
  let observation: unknown;
  try {
    if (fault === 'unproved-close') file.close = () => Promise.resolve();
    tracker.retainFile(file);
    if (reader !== undefined) tracker.retainReader(reader);
    await action({
      tracker,
      closeOwned,
      isOpen,
      attemptCleanup,
      cleanupAttempts: () => cleanupCount,
    });
  } catch (cause) {
    primary = cause;
  }
  {
    observation = {
      fault,
      primary:
        primary instanceof Error
          ? primary.message
          : primary === undefined
            ? undefined
            : typeof primary === 'string'
              ? primary
              : 'non-Error primary retained',
      retained: tracker.records.size,
      failures: tracker.failures.map((cause) =>
        cause instanceof Error ? cause.message : String(cause),
      ),
      originalFdOpen: await isOpen(),
      cleanupAttempts: cleanupCount,
    };
    await closeOwned();
    tracker.assertRelease();
    if (await isOpen())
      throw new AggregateError(
        [primary, Error('owned acquisition physical close unresolved')],
        'acquisition control retained',
      );
    rmSync(directory, { recursive: true });
    await canonicalFs.writeFile(
      '/tmp/puni-b2-outer-lifetime-20261026/last-acquisition-observation.json',
      JSON.stringify({
        beforeCleanup: observation,
        afterCleanup: {
          originalFdClosed: true,
          directoryRemoved: true,
          retained: tracker.records.size,
        },
      }),
      { mode: 0o600 },
    );
  }
  if (primary !== undefined)
    throw primary instanceof Error
      ? primary
      : new AggregateError([primary], 'original control failure');
}

test('canonical outer acquisition records actual handle before a post-acquisition wrapper failure', async () => {
  await withRawAcquisition(
    'post-acquire',
    async ({ tracker, closeOwned, isOpen, attemptCleanup, cleanupAttempts }) => {
      let originalFailure: unknown;
      try {
        throw Error('injected fallible post-open wrapper');
      } catch (cause) {
        originalFailure = cause;
      }
      expect((originalFailure as Error).message).toBe('injected fallible post-open wrapper');
      let refusal: unknown;
      try {
        await attemptCleanup();
      } catch (cause) {
        refusal = cause;
      }
      expect((refusal as Error).message).toBe('raw acquisition settlement retained');
      expect(cleanupAttempts()).toBe(0);
      expect(tracker.records.size).toBe(1);
      expect(await isOpen()).toBe(true);
      await closeOwned();
      await attemptCleanup();
      expect(cleanupAttempts()).toBe(1);
    },
  );
}, 10000);

test('canonical outer acquisition close fulfillment without actual FD closure retains the same handle', async () => {
  await withRawAcquisition(
    'unproved-close',
    async ({ tracker, closeOwned, isOpen, attemptCleanup, cleanupAttempts }) => {
      const record = tracker.records.values().next().value as {
        original: { close: () => Promise<void> };
      };
      let refusal: unknown;
      try {
        await record.original.close();
      } catch (cause) {
        refusal = cause;
      }
      let cleanupRefusal: unknown;
      try {
        await attemptCleanup();
      } catch (cause) {
        cleanupRefusal = cause;
      }
      expect((cleanupRefusal as Error).message).toBe('raw acquisition settlement retained');
      expect((refusal as Error).message).toBe('raw file close remains unproved');
      expect(tracker.hasRetained()).toBe(true);
      expect(await isOpen()).toBe(true);
      expect(cleanupAttempts()).toBe(0);
      await closeOwned();
      await attemptCleanup();
      expect(cleanupAttempts()).toBe(1);
      expect(tracker.failures).toHaveLength(1);
    },
  );
}, 10000);

test('canonical outer acquisition retains and proves actual directory reader close', async () => {
  await withRawAcquisition('reader', async ({ tracker, closeOwned, isOpen, attemptCleanup }) => {
    expect(tracker.records.size).toBe(2);
    expect(await isOpen()).toBe(true);
    expect(() => {
      tracker.assertRelease();
    }).toThrow('raw acquisition settlement retained');
    await closeOwned();
    expect(tracker.hasRetained()).toBe(false);
    await attemptCleanup();
  });
}, 10000);

/** Behavior-only prefix control: the local Set is not C authority and the first input consumer only throws. */
async function compileRawScopePrefix(directory: string) {
  const syntax = await import('typescript');
  const helperText = await canonicalFs.readFile(
    import.meta.dir + '/source-stageb-fixture-bootstrap.test.ts',
    'utf8',
  );
  const parsed = syntax.createSourceFile('helper.ts', helperText, syntax.ScriptTarget.Latest, true);
  let moduleSource: string | undefined;
  let providerSource: string | undefined;
  function visit(node: SyntaxNode) {
    if (
      syntax.isVariableDeclaration(node) &&
      syntax.isIdentifier(node.name) &&
      node.name.text === 'retainedLifetimeModuleSource' &&
      node.initializer !== undefined &&
      syntax.isNoSubstitutionTemplateLiteral(node.initializer)
    )
      moduleSource = node.initializer.text;
    if (syntax.isFunctionDeclaration(node) && node.name?.text === 'provideRetainedLifetimeModule')
      providerSource = node.getText(parsed);
    syntax.forEachChild(node, visit);
  }
  visit(parsed);
  if (
    moduleSource === undefined ||
    hash(moduleSource) !== '5db21a4a6d9804e0130258e368c7769516a4900338fc0ed25bd7f5a52321a347' ||
    providerSource === undefined
  )
    throw Error('exact private retained module absent');
  const providerJs = syntax.transpileModule(providerSource, {
    compilerOptions: { target: syntax.ScriptTarget.ESNext, module: syntax.ModuleKind.ESNext },
  }).outputText;
  // Exact helper-owned compiler plugin, with its immutable negative-only module body; no helper test import.
  const setup = (
    (await import(
      'data:text/javascript;base64,' +
        Buffer.from(
          'const retainedLifetimeModuleSource=' +
            JSON.stringify(moduleSource) +
            ';' +
            providerJs +
            ';export {provideRetainedLifetimeModule};',
        ).toString('base64')
    )) as { provideRetainedLifetimeModule: (build: Bun.PluginBuilder) => void }
  ).provideRetainedLifetimeModule;
  const raw = canonicalRawModelSource(directory + '/prefix-only', 'a'.repeat(32));
  const rawTree = syntax.createSourceFile(
    'raw.js',
    raw,
    syntax.ScriptTarget.Latest,
    true,
    syntax.ScriptKind.JS,
  );
  const entry = rawTree.statements.find(
    (statement) =>
      syntax.isFunctionDeclaration(statement) &&
      statement.name?.text === 'runLowerConstructionProbe',
  );
  if (entry === undefined || !syntax.isFunctionDeclaration(entry) || entry.body === undefined)
    throw Error('actual raw prefix absent');
  const statements: string[] = [];
  let reached = false;
  for (const statement of entry.body.statements) {
    statements.push(statement.getText(rawTree));
    if (
      syntax.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          syntax.isIdentifier(declaration.name) && declaration.name.text === 'originalInputs',
      )
    ) {
      reached = true;
      break;
    }
  }
  if (!reached) throw Error('actual first input boundary absent');
  const prefix = statements.join('\n');
  const contents =
    "import {isProxy as modelIsProxy} from 'node:util/types';import * as modelFs from 'node:fs/promises';import * as modelSync from 'node:fs';import * as modelChild from 'node:child_process';import {RetainedProbeLifetime} from 'stageb:retained-lifetime';" +
    canonicalRetainedErrorSource() +
    "let attempts=0;function inspectSourceInputs(){attempts++;throw Error('protected first input consumer reached');}export function runPrefix(failedConstructions){const inputs=undefined,artifacts=undefined,staging=undefined,journal=undefined,borrow=undefined,originalArchive=undefined;" +
    prefix +
    '}export {RetainedProbeLifetime,inspectRawRetainedError};export const inputAttempts=()=>attempts;';
  const built = await Bun.build({
    entrypoints: ['raw-scope:prefix'],
    target: 'bun',
    format: 'esm',
    splitting: false,
    minify: false,
    plugins: [
      { name: 'actual-private-retained-provider', setup },
      {
        name: 'protected-first-input-control',
        setup(build) {
          build.onResolve({ filter: /^raw-scope:prefix$/ }, () => ({
            path: 'scope-prefix',
            namespace: 'scope-prefix',
          }));
          build.onLoad({ filter: /.*/, namespace: 'scope-prefix' }, () => ({
            loader: 'js',
            contents,
          }));
        },
      },
    ],
  });
  if (!built.success) throw new AggregateError(built.logs, 'raw prefix compilation refused');
  const output = built.outputs.find((output) => output.kind === 'entry-point');
  if (output === undefined) throw Error('raw prefix entry absent');
  const bytes = new Uint8Array(await output.arrayBuffer());
  const path = directory + '/prefix-control.mjs';
  await canonicalFs.writeFile(path, bytes, { mode: 0o600 });
  const observed = (await import(path)) as {
    runPrefix: (scope: Set<unknown>) => void;
    inputAttempts: () => number;
    RetainedProbeLifetime: {
      new (message: string, failures: readonly unknown[], refs: readonly unknown[]): AggregateError;
      recognizes: (cause: unknown) => boolean;
    };
    inspectRawRetainedError: (cause: unknown) => {
      retained?: AggregateError;
      unsupported?: string;
      references: unknown[];
      messages: string[];
    };
  };
  return {
    ...observed,
    proof: {
      moduleSourceSha256: hash(moduleSource),
      providerSourceSha256: hash(providerSource),
      prefixSha256: hash(prefix),
      emittedSha256: hash(bytes),
    },
  };
}

test('canonical outer scope prefix refuses preexisting unrelated members before the first input consumer', async () => {
  await withRawLifetimeChild('cooperative', async ({ child, lifetime, joined, directory }) => {
    const probe = await compileRawScopePrefix(directory);
    const localScope = new Set<unknown>([child]);
    let refusal: unknown;
    try {
      probe.runPrefix(localScope);
    } catch (cause) {
      refusal = cause;
    }
    expect(probe.RetainedProbeLifetime.recognizes(refusal)).toBe(true);
    expect(probe.inputAttempts()).toBe(0);
    expect(localScope.has(child)).toBe(true);
    expect(probe.RetainedProbeLifetime.recognizes(Error('plain lookalike'))).toBe(false);
    let firstInput: unknown;
    try {
      probe.runPrefix(new Set());
    } catch (cause) {
      firstInput = cause;
    }
    expect((firstInput as Error).message).toBe('protected first input consumer reached');
    expect(probe.inputAttempts()).toBe(1);
    child.stdin.end('finish');
    await joined;
    await lifetime.finish();
    await canonicalFs.writeFile(
      '/tmp/puni-b2-outer-lifetime-20261026/scope-prefix-receipt.json',
      JSON.stringify({
        ...probe.proof,
        scope: 'behavior-only unit-local Set; original same-builder association static audit only',
        inputAttempts: probe.inputAttempts(),
        originalChildAndBothEofJoined: true,
      }),
      { mode: 0o600 },
    );
  });
}, 10000);

test('canonical outer error graph recognizes only the shared nominal through bounded own data', async () => {
  await withRawLifetimeChild('cooperative', async ({ child, lifetime, joined, directory }) => {
    const probe = await compileRawScopePrefix(directory);
    const retained = new probe.RetainedProbeLifetime(
      'actual negative nominal',
      [Error('original primary')],
      [child, child.stdout, child.stderr],
    );
    const wrapped = new AggregateError([Error('sibling'), retained], 'outer wrapped', {
      cause: retained,
    });
    expect(probe.inspectRawRetainedError(wrapped).retained).toBe(retained);
    const plain = Object.create(Object.getPrototypeOf(retained) as object | null) as Error;
    expect(probe.RetainedProbeLifetime.recognizes(plain)).toBe(false);
    let invoked = 0;
    const accessor = Error('accessor');
    Object.defineProperty(accessor, 'cause', {
      get() {
        invoked++;
        return retained;
      },
    });
    expect(probe.inspectRawRetainedError(accessor).unsupported).toBe('accessor error cause');
    expect(invoked).toBe(0);
    const proxy = new Proxy(Error('proxy'), {
      getPrototypeOf() {
        invoked++;
        return Error.prototype;
      },
    });
    expect(probe.inspectRawRetainedError(proxy).unsupported).toBe('proxy error record');
    expect(invoked).toBe(0);
    const cycle = Error('cycle');
    Object.defineProperty(cycle, 'cause', { value: cycle });
    expect(probe.inspectRawRetainedError(cycle).unsupported).toBe('cyclic error record');
    let deep: Error = retained;
    for (let index = 0; index < 34; index++) deep = new Error('depth', { cause: deep });
    expect(probe.inspectRawRetainedError(deep).unsupported).toBe('error graph bound');
    const wide = new AggregateError(
      Array.from({ length: 257 }, () => Error('wide')),
      'wide',
    );
    expect(probe.inspectRawRetainedError(wide).unsupported).toBe('aggregate array bound');
    child.stdin.end('finish');
    await joined;
    await lifetime.finish();
    await canonicalFs.writeFile(
      '/tmp/puni-b2-outer-lifetime-20261026/error-graph-receipt.json',
      JSON.stringify({
        ...probe.proof,
        originalNominal: true,
        gettersInvoked: invoked,
        opaqueCycleAndBoundsRefused: true,
      }),
      { mode: 0o600 },
    );
  });
}, 10000);

test('canonical model compiler retains same fixed worker bytes with closed primitive adapters', async () => {
  const fixture = await createCanonicalModelFixture();
  const facility = JSON.parse(fixture.proposed.facilityBytes.toString()) as SourceFixtureAuthority;
  expect(hash(fixture.proposed.worker.bytes)).toBe(facility.worker.sha256);
  expect(fixture.proposed.worker.bytes.byteLength).toBe(facility.worker.bytes);
  expect(fixture.proposed.migrationPackage.envelope).toBe(facility.migration.envelope);
  expect(fixture.proposed.migrationPackage.databases).toEqual(facility.migration.databases);
}, 30000);
test('canonical constructor raw model intercepts unsafe spawn paths and fake PID signals before native entry', async () => {
  const observed = await runCanonicalPublicModel('interceptor-preflight');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  const evidence = JSON.parse(observed.stdout) as { primary: string[]; blocked: unknown[] };
  expect(evidence.primary).toEqual([]);
  expect(evidence.blocked).toHaveLength(4);
}, 60000);
test('public constructor canonical model completes original I J B1 A2 construction and memoized disposal', async () => {
  const observed = await runCanonicalPublicModel();
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  const evidence = JSON.parse(observed.stdout) as {
    executionEffects?: unknown[];
    databaseOpeners?: unknown[];
    success: boolean;
    primary: string[];
    closeMemoized: boolean;
  };
  expect({ primary: evidence.primary, workerReceipts: evidence.executionEffects }).toEqual({
    primary: [],
    workerReceipts: evidence.executionEffects,
  });
  expect(evidence.success).toBe(true);
  expect(evidence.databaseOpeners).toEqual([]);
  expect(evidence.closeMemoized).toBe(true);
}, 180000);

/** Observes actual owned-file opens throughout a phase, including completed transient SQLite connections. */
function observeDatabaseOpens(path: string) {
  const libc = dlopen('libc.so.6', {
    inotify_init1: { args: ['i32'], returns: 'i32' },
    inotify_add_watch: { args: ['i32', 'ptr', 'u32'], returns: 'i32' },
    read: { args: ['i32', 'ptr', 'u64'], returns: 'i64' },
    close: { args: ['i32'], returns: 'i32' },
    __errno_location: { args: [], returns: 'ptr' },
  });
  let descriptor = -1;
  let closed = false;
  try {
    descriptor = libc.symbols.inotify_init1(0x800 | 0x80000);
    if (descriptor < 0) throw Error('owned inotify acquisition failed');
    const pathname = Buffer.from(path + '\0');
    const watch = libc.symbols.inotify_add_watch(
      descriptor,
      ptr(pathname),
      0x20 | 0x1 | 0x18 | 0x02000000,
    );
    if (watch < 0) throw Error('owned DB inotify watch failed');
    const buffer = Buffer.alloc(65536);
    return {
      drain() {
        if (closed) throw Error('owned inotify already closed');
        const events: number[] = [];
        for (;;) {
          const count = Number(libc.symbols.read(descriptor, ptr(buffer), buffer.length));
          if (count < 0) {
            const errno = libc.symbols.__errno_location();
            if (errno === null || ffiRead.i32(errno) !== 11)
              throw Error('owned inotify read failed');
            break;
          }
          if (count === 0) break;
          for (let offset = 0; offset < count;) {
            if (count - offset < 16) throw Error('owned inotify event truncated');
            const mask = buffer.readUInt32LE(offset + 4);
            const names = buffer.readUInt32LE(offset + 12);
            if ((mask & 0x4000) !== 0 || offset + 16 + names > count)
              throw Error('owned inotify overflow or malformed event');
            events.push(mask);
            offset += 16 + names;
          }
        }
        return events;
      },
      close() {
        if (closed) return;
        closed = true;
        try {
          if (libc.symbols.close(descriptor) !== 0) throw Error('owned inotify close failed');
        } finally {
          libc.close();
        }
      },
    };
  } catch (failure) {
    try {
      if (descriptor >= 0 && libc.symbols.close(descriptor) !== 0)
        throw Error('owned inotify initialization close failed', { cause: failure });
    } finally {
      libc.close();
    }
    throw failure;
  }
}

test('fixed worker refuses a grant exhausted during post-permit envelope reads before any SQLite open', async () => {
  const owned = await fixture('delay-envelope');
  const opens = observeDatabaseOpens(owned.fixed.databases[0].path);
  const child = owned.spawn('prod');
  const reader = child.stdout.getReader();
  const stderr = new Response(child.stderr).text();
  try {
    await ready(reader, stderr);
    expect(opens.drain()).toEqual([]);
    await child.stdin.write(encodeSourceMigrationFrame({ ...owned.permit, remainingMs: 200 }));
    await child.stdin.end();
    const terminal = await reader.read();
    if (terminal.done) throw Error('terminal absent');
    await reader.read();
    const exit = await child.exited;
    const activity = opens.drain();
    opens.close();
    const database = new Database(owned.fixed.databases[0].path, { readonly: true });
    let tables: unknown[];
    try {
      tables = database.query("SELECT name FROM sqlite_master WHERE name='worker_sentinel'").all();
    } finally {
      database.close();
    }
    expect({ activity, tables }).toEqual({ activity: [], tables: [] });
    expect(decodeSourceMigrationFrames(terminal.value)[0]).toMatchObject({
      phase: 'failed',
      reason: 'deadline',
    });
    expect(exit).toBe(1);
    expect(await stderr).toBe('');
  } finally {
    opens.close();
    await child.stdin.end();
    if (child.exitCode === null) child.kill();
    await child.exited;
    reader.releaseLock();
    await stderr;
    rmSync(owned.root, { recursive: true });
  }
}, 30000);

test('fixed worker refuses an actually incomplete applied ledger before publishing complete', async () => {
  const owned = await fixture('drop-ledger');
  const child = owned.spawn('prod');
  const reader = child.stdout.getReader();
  const stderr = new Response(child.stderr).text();
  try {
    await ready(reader, stderr);
    await child.stdin.write(encodeSourceMigrationFrame(owned.permit));
    await child.stdin.end();
    const terminal = await reader.read();
    if (terminal.done) throw Error('terminal absent');
    expect((await reader.read()).done).toBe(true);
    expect(await child.exited).toBe(1);
    expect(decodeSourceMigrationFrames(terminal.value)[0]).toMatchObject({
      phase: 'failed',
      reason: 'migration',
    });
    expect(await stderr).toBe('');
    const database = new Database(owned.fixed.databases[0].path, { readonly: true });
    try {
      expect(
        database.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all(),
      ).toEqual(owned.expectedApplied.slice(1));
    } finally {
      database.close();
    }
  } finally {
    await child.stdin.end();
    if (child.exitCode === null) child.kill();
    await child.exited;
    reader.releaseLock();
    await stderr;
    rmSync(owned.root, { recursive: true });
  }
}, 30000);

for (const fault of [
  'extra-argv',
  'missing-argv',
  'environment',
  'extra-environment',
  'copy-directory',
  'envelope-member',
  'manifest-symlink',
  'manifest-unreadable',
  'manifest-missing',
  'sql-missing',
  'sql-unreadable',
  'manifest-hash',
  'drizzle-member',
  'row-member',
  'wall-expired',
  'wire-noncanonical',
] as const)
  test(`fixed worker boundary ${fault} refuses before actual DB open`, async () => {
    const owned = await fixture();
    const manifest = join(owned.fixed.envelope, 'manifest.json');
    if (fault === 'envelope-member')
      writeFileSync(join(owned.fixed.envelope, 'foreign-sentinel'), 'foreign-inert');
    if (fault === 'manifest-symlink') {
      const bytes = readFileSync(manifest);
      await canonicalFs.unlink(manifest);
      writeFileSync(join(owned.root, 'manifest-original.json'), bytes);
      await canonicalFs.symlink(join(owned.root, 'manifest-original.json'), manifest);
    }
    if (fault === 'manifest-unreadable') chmodSync(manifest, 0);
    if (fault === 'manifest-missing') await canonicalFs.unlink(manifest);
    if (fault === 'sql-missing')
      await canonicalFs.unlink(
        join(
          owned.fixed.envelope,
          'drizzle',
          '20261022211000_add_external_dependencies',
          'migration.sql',
        ),
      );
    if (fault === 'sql-unreadable')
      chmodSync(
        join(
          owned.fixed.envelope,
          'drizzle',
          '20261022211000_add_external_dependencies',
          'migration.sql',
        ),
        0,
      );
    if (fault === 'drizzle-member') {
      const directory = join(owned.fixed.envelope, 'drizzle', '20261022211500_foreign');
      mkdirSync(directory);
      writeFileSync(
        join(directory, 'migration.sql'),
        'CREATE TABLE foreign_sql_effect(value TEXT);\n',
      );
      writeFileSync(join(directory, 'down.sql'), 'DROP TABLE foreign_sql_effect;\n');
    }
    if (fault === 'row-member')
      writeFileSync(
        join(
          owned.fixed.envelope,
          'drizzle',
          '20261022211000_add_external_dependencies',
          'foreign-sentinel',
        ),
        'foreign-inert',
      );
    if (fault === 'manifest-hash') {
      const changed = JSON.parse(readFileSync(manifest, 'utf8')) as { candidateImage: string };
      changed.candidateImage = changed.candidateImage.replace('registry/', 'different/');
      writeFileSync(manifest, JSON.stringify(changed) + '\n');
    }
    const activity = observeDatabaseOpens(owned.fixed.databases[0].path);
    const launchFault = [
      'extra-argv',
      'missing-argv',
      'environment',
      'extra-environment',
      'copy-directory',
    ].includes(fault)
      ? (fault as
          'extra-argv' | 'missing-argv' | 'environment' | 'extra-environment' | 'copy-directory')
      : 'ordinary';
    const child = owned.spawn('prod', launchFault);
    const stdout = new Response(child.stdout).arrayBuffer();
    const stderr = new Response(child.stderr).text();
    try {
      let permit = Buffer.from(
        encodeSourceMigrationFrame(
          fault === 'wall-expired' ? { ...owned.permit, notAfter: Date.now() - 1 } : owned.permit,
        ),
      );
      if (fault === 'wire-noncanonical') {
        const body = Buffer.concat([permit.subarray(4), Buffer.from('\n')]);
        permit = Buffer.alloc(body.length + 4);
        permit.writeUInt32BE(body.length);
        body.copy(permit, 4);
      }
      await child.stdin.write(permit);
      await child.stdin.end();
      const code = await child.exited;
      const output = new Uint8Array(await stdout);
      const errors = await stderr;
      const events = activity.drain();
      activity.close();
      expect(events).toEqual([]);
      expect(code).not.toBe(0);
      if (fault === 'extra-argv' || fault === 'missing-argv') {
        expect(output).toHaveLength(0);
        expect(errors).toContain('source migration boundary refused');
      } else {
        const frames = decodeSourceMigrationFrames(output);
        expect(frames.at(-1)).toMatchObject({
          phase: 'failed',
          reason: fault === 'wall-expired' ? 'deadline' : 'permission-refused',
        });
        expect(errors).toBe('');
      }
      const probe = new Database(owned.fixed.databases[0].path, { readonly: true });
      try {
        expect(
          probe
            .query(
              "SELECT name FROM sqlite_master WHERE name IN ('worker_sentinel','foreign_sql_effect')",
            )
            .all(),
        ).toEqual([]);
      } finally {
        probe.close();
      }
      if (fault === 'envelope-member')
        expect(readFileSync(join(owned.fixed.envelope, 'foreign-sentinel'), 'utf8')).toBe(
          'foreign-inert',
        );
    } finally {
      activity.close();
      await child.stdin.end();
      if (child.exitCode === null) child.kill();
      await child.exited;
      await stdout;
      await stderr;
      rmSync(owned.root, { recursive: true });
    }
  }, 30000);

for (const fault of [
  'stream-bound',
  'header',
  'body-bound',
  'truncated',
  'canonical',
  'count',
] as const)
  test(`migration decoder distinguishes ${fault} at its actual closed boundary`, () => {
    const frame = encodeSourceMigrationFrame({
      version: 1,
      nonce: 'a'.repeat(32),
      environment: 'prod',
      phase: 'ready',
    });
    let bytes: Uint8Array;
    let expected: string;
    if (fault === 'stream-bound') {
      bytes = Buffer.alloc(2057);
      expected = 'frame-stream-bound';
    } else if (fault === 'header') {
      bytes = Buffer.alloc(3);
      expected = 'frame-header';
    } else if (fault === 'body-bound') {
      const encoded = Buffer.alloc(1029, 32);
      encoded.writeUInt32BE(1025);
      bytes = encoded;
      expected = 'frame-body';
    } else if (fault === 'truncated') {
      bytes = frame.subarray(0, frame.length - 1);
      expected = 'frame-body';
    } else if (fault === 'count') {
      bytes = Buffer.concat([frame, frame, frame]);
      expected = 'frame-body';
    } else {
      const body = Buffer.concat([frame.subarray(4), Buffer.from('\n')]);
      const encoded = Buffer.alloc(body.length + 4);
      encoded.writeUInt32BE(body.length);
      body.copy(encoded, 4);
      bytes = encoded;
      expected = 'frame-canonical';
    }
    expect(() => decodeSourceMigrationFrames(bytes)).toThrow(
      'source migration ' + expected + ' refused',
    );
  });

for (const fault of ['manifest-drift', 'manifest-type', 'oversize-manifest'] as const)
  test(`fixed worker native read boundary ${fault} refuses before raw read or SQLite effect`, async () => {
    const owned = await fixture(fault);
    if (fault === 'oversize-manifest')
      writeFileSync(
        join(owned.fixed.envelope, 'manifest.json'),
        Buffer.alloc(4 * 1024 * 1024 + 1, 32),
      );
    const activity = observeDatabaseOpens(owned.fixed.databases[0].path);
    const child = owned.spawn('prod');
    const stdout = new Response(child.stdout).arrayBuffer();
    const stderr = new Response(child.stderr).text();
    try {
      await child.stdin.write(encodeSourceMigrationFrame(owned.permit));
      await child.stdin.end();
      const code = await child.exited;
      const bytes = new Uint8Array(await stdout);
      const errors = await stderr;
      const events = activity.drain();
      activity.close();
      expect({ code, events, frames: decodeSourceMigrationFrames(bytes) }).toEqual({
        code: 1,
        events: [],
        frames: [
          {
            version: 1,
            nonce: owned.fixed.nonce,
            environment: 'prod',
            phase: 'failed',
            reason: 'permission-refused',
          },
        ],
      });
      expect(errors).toBe('');
    } finally {
      activity.close();
      await child.stdin.end();
      if (child.exitCode === null) child.kill();
      await child.exited;
      await stdout;
      await stderr;
      rmSync(owned.root, { recursive: true });
    }
  }, 30000);
