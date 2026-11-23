import { expect, test } from 'bun:test';

interface ErrorObservation {
  readonly kind: string;
  readonly message?: string;
  readonly causeOwn: boolean;
  readonly causeMatchesFirst: boolean;
  readonly errors: readonly { kind: string; message?: string }[];
  readonly closeFailureMatchesLast: boolean;
  readonly cleanupUnknown: boolean;
}
interface Observation {
  readonly mode: string;
  readonly attempts: readonly { threw: boolean; failure: ErrorObservation }[];
  readonly clients: readonly { id: number; state: string; message?: string }[];
  readonly closeCalls: readonly {
    client: number;
    args: readonly boolean[];
    delegated: boolean;
    returned: boolean;
  }[];
  readonly fixtureCloses: number;
  readonly ownerRemoved: boolean;
  readonly stagingRemoved: boolean;
  readonly ledger?: readonly { name: string; hash: string }[];
  readonly witnesses?: number;
}

/** Every injected pragma failure delegates the actual native read after changing real SQLite state. */
function scriptOf(mode: string): string {
  const healthySql =
    'CREATE TABLE cleanup_probe(value INTEGER NOT NULL);\n--> statement-breakpoint\nINSERT INTO cleanup_probe VALUES(1);';
  return `
import {mkdirSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Database} from 'bun:sqlite';
import {runMigrations} from ${JSON.stringify(new URL('./migrate.ts', import.meta.url).pathname)};
import {openDatabase} from ${JSON.stringify(new URL('./db.ts', import.meta.url).pathname)};
import {createIsolatedStore} from ${JSON.stringify(new URL('./isolated-store.ts', import.meta.url).pathname)};
import {isSqliteCleanupUnknown} from ${JSON.stringify(new URL('./sqlite-cleanup.ts', import.meta.url).pathname)};
const mode=${JSON.stringify(mode)};
const owner=createIsolatedStore();
const staging=mkdtempSync(join(tmpdir(),'wbs-migration-cleanup-'));
const migration=join(staging,'20260101000000_cleanup_probe');
mkdirSync(migration);
const badSql=mode==='body-and-final';
writeFileSync(join(migration,'migration.sql'),badSql?'THIS IS NOT VALID SQL;':${JSON.stringify(healthySql)});
console.log('migration resources '+JSON.stringify({mode,ownerPath:owner.path,staging}));
const nativeQuery=Database.prototype.query;
const nativeRun=Database.prototype.run;
const nativeClose=Database.prototype.close;
const clients=[];
const counts=new Map();
const closeCalls=[];
const closeFailure=new Error('selected migration close refusal');
function clientOf(database){
  let current=counts.get(database);
  if(current===undefined){current={id:clients.length+1,fkReads:0};counts.set(database,current);clients.push(database);}
  return current;
}
Database.prototype.query=function(statement,...rest){
  if(this.filename===owner.path){
    const current=clientOf(this);
    if(typeof statement==='string'&&statement.trim()==='PRAGMA foreign_keys;'){
      current.fkReads++;
      if((mode==='initial-undefined'||mode==='undefined-and-close')&&current.fkReads===2)throw undefined;
      const initial=(mode==='initial'||mode==='operation-and-close')&&current.fkReads===2;
      const final=(mode==='final'||mode==='body-and-final')&&current.fkReads===3;
      if(initial||final)nativeRun.call(this,'PRAGMA foreign_keys = OFF;');
    }
  }
  return nativeQuery.apply(this,[statement,...rest]);
};
Database.prototype.close=function(...args){
  if(this.filename!==owner.path)return nativeClose.apply(this,args);
  const current=clientOf(this);
  const attempt={client:current.id,args:[...args],delegated:false,returned:false};
  closeCalls.push(attempt);
  if(mode==='close-only'||mode==='operation-and-close'||mode==='undefined-and-close')throw closeFailure;
  attempt.delegated=true;
  nativeClose.apply(this,args);
  if(mode==='close-after')throw closeFailure;
  attempt.returned=true;
};
function shallow(cause){return cause instanceof Error?{kind:cause.name,message:cause.message}:{kind:cause===undefined?'undefined':typeof cause};}
function failureOf(cause){
  const aggregate=cause instanceof AggregateError;
  const errors=aggregate?cause.errors:[];
  return {...shallow(cause),causeOwn:typeof cause==='object'&&cause!==null&&Object.hasOwn(cause,'cause'),causeMatchesFirst:aggregate&&Object.hasOwn(cause,'cause')&&cause.cause===errors[0],errors:errors.map(shallow),closeFailureMatchesLast:aggregate&&errors[errors.length-1]===closeFailure,cleanupUnknown:isSqliteCleanupUnknown(cause)};
}
function nativeState(database){
  try{
    const row=nativeQuery.call(database,'SELECT 42 AS alive').get();
    return row?.alive===42?{id:clientOf(database).id,state:'queryable'}:{id:clientOf(database).id,state:'unexpected',row};
  }catch(cause){return{id:clientOf(database).id,state:cause instanceof Error&&/closed/i.test(cause.message)?'closed':'unexpected-error',message:cause instanceof Error?cause.message:String(cause)};}
}
const attempts=[];
let observation;
let primary;
let primaryPresent=false;
try{
  for(let invocation=0;invocation<(mode==='healthy'?2:1);invocation++){
    let threw=false;
    let failure;
    try{runMigrations(owner.path,staging);}catch(cause){threw=true;failure=cause;}
    attempts.push({threw,failure:failureOf(failure)});
  }
  observation={mode,attempts,clients:clients.map(nativeState),closeCalls,fixtureCloses:0,ownerRemoved:false,stagingRemoved:false};
}catch(cause){primary=cause;primaryPresent=true;}
finally{
  Database.prototype.query=nativeQuery;
  Database.prototype.close=nativeClose;
}
const retirementFailures=[];
let fixtureCloses=0;
for(const database of clients){
  const before=nativeState(database);
  if(before.state==='queryable'){
    try{nativeClose.call(database,true);fixtureCloses++;}catch(cause){retirementFailures.push(cause);}
  }else if(before.state!=='closed')retirementFailures.push(new Error('original client closure was not established'));
  if(nativeState(database).state!=='closed')retirementFailures.push(new Error('fixture native retirement did not close the original client'));
}
if(retirementFailures.length!==0)throw new AggregateError(retirementFailures,'fixture retirement failed; owned paths retained');
if(primaryPresent)throw primary;
observation.fixtureCloses=fixtureCloses;
if(mode==='healthy'){
  const probe=openDatabase(owner.path);
  try{
    observation.ledger=probe.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all();
    observation.witnesses=probe.query('SELECT COUNT(*) AS n FROM cleanup_probe').get().n;
  }finally{nativeClose.call(probe,true);}
}
await owner.close();
observation.ownerRemoved=!existsSync(owner.path);
unlinkSync(join(migration,'migration.sql'));rmdirSync(migration);rmdirSync(staging);
observation.stagingRemoved=!existsSync(staging);
console.log('migration observation '+JSON.stringify(observation));
`;
}

function observe(mode: string): Observation {
  const child = Bun.spawnSync([process.execPath, '--eval', scriptOf(mode)], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  const receipt = {
    mode,
    exitCode: child.exitCode,
    success: child.success,
    signalField: child.signalCode ?? 'absent',
    timeoutField: child.exitedDueToTimeout ?? 'absent',
    stdout: new TextDecoder().decode(child.stdout),
    stderr: new TextDecoder().decode(child.stderr),
  };
  console.log('migration-cleanup native ' + JSON.stringify(receipt));
  expect(child.exitCode).toBe(0);
  expect(child.success).toBe(true);
  expect(receipt.stderr).toBe('');
  const line = receipt.stdout.split('\n').find((line) => line.startsWith('migration observation '));
  if (line === undefined) throw Error('actual migration observation absent');
  const observation = JSON.parse(line.slice('migration observation '.length)) as Observation;
  expect(observation.ownerRemoved).toBe(true);
  expect(observation.stagingRemoved).toBe(true);
  return observation;
}

function expectOneClose(observation: Observation): void {
  expect(observation.closeCalls).toHaveLength(1);
  expect(observation.closeCalls[0]?.client).toBe(1);
  expect(observation.closeCalls[0]?.args).toEqual([true]);
}

test('C01 migrator closes its actual client after healthy and repeated migration', () => {
  const observed = observe('healthy');
  expect(observed.attempts.map((attempt) => attempt.threw)).toEqual([false, false]);
  expect(observed.closeCalls).toHaveLength(2);
  expect(observed.closeCalls.map((attempt) => attempt.client)).toEqual([1, 2]);
  expect(observed.closeCalls.every((attempt) => attempt.delegated && attempt.returned)).toBe(true);
  expect(observed.clients.map((client) => client.state)).toEqual(['closed', 'closed']);
  expect(observed.fixtureCloses).toBe(0);
  expect(observed.ledger).toHaveLength(1);
  expect(observed.ledger?.[0]?.name).toBe('20260101000000_cleanup_probe');
  expect(observed.witnesses).toBe(1);
});

test.each([
  ['C02', 'initial'],
  ['C03', 'final'],
] as const)(
  '%s migrator pragma refusal still closes the retained original client (%s)',
  (_label, mode) => {
    const observed = observe(mode);
    expectOneClose(observed);
    expect(observed.clients[0]?.state).toBe('closed');
    expect(observed.fixtureCloses).toBe(0);
    expect(observed.attempts[0]?.threw).toBe(true);
    expect(observed.attempts[0]?.failure.message).toBe('expected foreign_keys=1, got 0');
    expect(observed.attempts[0]?.failure.cleanupUnknown).toBe(false);
  },
);

test('C04 migrator preserves body and final validation failures before successful close', () => {
  const observed = observe('body-and-final');
  expectOneClose(observed);
  const failure = observed.attempts[0]?.failure;
  expect(failure.errors).toHaveLength(2);
  expect(failure.errors[0]?.message).toMatch(/syntax|THIS|INVALID/i);
  expect(failure.errors[1]?.message).toBe('expected foreign_keys=1, got 0');
  expect(failure.causeMatchesFirst).toBe(true);
  expect(failure.cleanupUnknown).toBe(false);
  expect(observed.clients[0]?.state).toBe('closed');
});

test('C05 migrator close-only refusal retains actual client custody without a fabricated primary', () => {
  const observed = observe('close-only');
  expectOneClose(observed);
  const failure = observed.attempts[0]?.failure;
  expect(failure.cleanupUnknown).toBe(true);
  expect(failure.errors).toHaveLength(1);
  expect(failure.causeOwn).toBe(false);
  expect(failure.closeFailureMatchesLast).toBe(true);
  expect(observed.clients[0]?.state).toBe('queryable');
  expect(observed.closeCalls[0]?.delegated).toBe(false);
  expect(observed.fixtureCloses).toBe(1);
});

test.each([
  ['C06', 'operation-and-close', 'Error'],
  ['C06u', 'undefined-and-close', 'undefined'],
] as const)(
  '%s migrator preserves operation and cleanup refusal without release',
  (_label, mode, primaryKind) => {
    const observed = observe(mode);
    expectOneClose(observed);
    const failure = observed.attempts[0]?.failure;
    expect(failure.errors).toHaveLength(2);
    expect(failure.errors[0]?.kind).toBe(primaryKind);
    expect(failure.causeOwn).toBe(true);
    expect(failure.causeMatchesFirst).toBe(true);
    expect(failure.closeFailureMatchesLast).toBe(true);
    expect(failure.cleanupUnknown).toBe(true);
    expect(observed.clients[0]?.state).toBe('queryable');
    expect(observed.fixtureCloses).toBe(1);
  },
);

test('C07 migrator close after-delegation throw remains cleanup-unknown', () => {
  const observed = observe('close-after');
  expectOneClose(observed);
  expect(observed.closeCalls[0]?.delegated).toBe(true);
  expect(observed.closeCalls[0]?.returned).toBe(false);
  expect(observed.attempts[0]?.failure.cleanupUnknown).toBe(true);
  expect(observed.attempts[0]?.failure.causeOwn).toBe(false);
  expect(observed.clients[0]?.state).toBe('closed');
  expect(observed.fixtureCloses).toBe(0);
});

test('C02u migrator preserves an actual thrown undefined after successful close', () => {
  const observed = observe('initial-undefined');
  expectOneClose(observed);
  expect(observed.attempts[0]?.threw).toBe(true);
  expect(observed.attempts[0]?.failure.kind).toBe('undefined');
  expect(observed.attempts[0]?.failure.cleanupUnknown).toBe(false);
  expect(observed.clients[0]?.state).toBe('closed');
  expect(observed.fixtureCloses).toBe(0);
});
