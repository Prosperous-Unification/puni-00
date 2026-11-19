import {dirname} from 'node:path';
import {SQLiteError} from 'bun:sqlite';
import {expect,test} from 'bun:test';
import {sql} from 'drizzle-orm';

import {runMigrations} from '../migrate';
import {rollbackTo} from '../migrate-down';
import {openSqliteStepCatalogueCase} from './step-catalogue-fixture';
import {MIGRATIONS_FOLDER} from './space-database';

type Fixture=Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const STEP='retirement-profile-step',BINDING='retirement-profile-binding';

function readFailureMessages(cause:unknown):string{
  const messages:string[]=[];
  for(let depth=0;depth<8&&cause instanceof Error;depth++){
    messages.push(cause.message);cause=cause.cause;
  }
  return messages.join('\n');
}
async function expectRefusal(work:()=>unknown,pattern:RegExp):Promise<void>{
  let observed:{cause:unknown}|undefined;
  try{await work();}catch(cause:unknown){observed={cause};}
  expect(observed).toBeDefined();
  if(observed===undefined)throw new Error('required retirement refusal did not occur');
  expect(readFailureMessages(observed.cause)).toMatch(pattern);
}
interface ProfileCustody{hasUnknownSecondaryOwner:boolean}
const MIGRATION='20261118210000_add_step_retirements';
const DOWN_REFUSAL='step retirement records require current schema; downgrade would reactivate identities';

/** rollbackTo rethrows this exact native refusal only after rollback and its finally-close return; any replacement stays unconfirmed. */
function rollbackProfile(fixture:Fixture,custody:ProfileCustody):string[]{
  custody.hasUnknownSecondaryOwner=true;
  try{
    const reversed=rollbackTo(readDatabasePath(fixture),MIGRATIONS_FOLDER,'20261118180000_add_resource_use_locations');
    custody.hasUnknownSecondaryOwner=false;
    return reversed;
  }catch(cause:unknown){
    if(cause instanceof Error&&Object.getPrototypeOf(cause)===Error.prototype&&cause.message==='rolling back '+MIGRATION+' failed: '+DOWN_REFUSAL&&cause.cause instanceof SQLiteError&&cause.cause.code==='SQLITE_CONSTRAINT_TRIGGER'&&cause.cause.message===DOWN_REFUSAL)custody.hasUnknownSecondaryOwner=false;
    throw cause;
  }
}
function reapplyProfile(fixture:Fixture,custody:ProfileCustody):void{
  custody.hasUnknownSecondaryOwner=true;
  runMigrations(readDatabasePath(fixture),MIGRATIONS_FOLDER);
  custody.hasUnknownSecondaryOwner=false;
}

async function runProfileCase(observe:(fixture:Fixture,custody:ProfileCustody)=>Promise<void>):Promise<void>{
  const fixture=await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
  const custody:ProfileCustody={hasUnknownSecondaryOwner:false};
  let directory:string|undefined;
  let primary:{cause:unknown}|undefined;
  try{directory=dirname(readDatabasePath(fixture));await observe(fixture,custody);}catch(cause:unknown){primary={cause};}
  if(custody.hasUnknownSecondaryOwner){
    const failures:unknown[]=primary===undefined?[]:[primary.cause];
    try{await fixture.source.close();}catch(cleanup:unknown){failures.push(cleanup);}
    const retained=new Error(directory===undefined?'Unconfirmed secondary retirement owner; retained fixture path was not captured':'Unconfirmed secondary retirement owner; fixture retained at '+directory);
    failures.push(retained);
    throw new AggregateError(failures,'retirement profile observation has unconfirmed secondary custody',{cause:retained});
  }
  try{await fixture.close();}catch(cleanup:unknown){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'retirement profile observation and close failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
}

async function defineStep(fixture:Fixture):Promise<void>{
  const{port,seed}=fixture;
  expect((await port.defineAndBindStep(seed.organizationId,{id:STEP,code:STEP,name:'Retirement profile step',defaultEstimateUnit:'workdays',defaultAllowancePercent:0,position:10},{bindingId:BINDING,scopeKind:'organization',scopeId:seed.organizationId,workItemTypeId:null,position:10},seed.stamp)).ok).toBe(true);
  expect((await port.readCatalogue(seed.organizationId))?.definitions.map(row=>row.id)).toEqual([STEP]);
  expect(fixture.source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
}
async function unbindStep(fixture:Fixture):Promise<void>{
  expect(await fixture.port.unbindStep(fixture.seed.organizationId,BINDING,{dryRun:false},fixture.seed.stamp)).toMatchObject({kind:'unbound'});
}
async function retireStep(fixture:Fixture):Promise<void>{
  await defineStep(fixture);await unbindStep(fixture);
  expect(await fixture.port.retireStepDefinition(fixture.seed.organizationId,STEP,fixture.seed.stamp)).toEqual({ok:true});
  expect(await fixture.port.readCatalogue(fixture.seed.organizationId)).toEqual({definitions:[],bindings:[]});
  expect(fixture.source.db.all(sql`SELECT step_id FROM step_retirement`)).toEqual([{step_id:STEP}]);
}
function readDatabasePath(fixture:Fixture):string{
  const rows=fixture.source.db.all<{name:unknown;file:unknown}>(sql`PRAGMA database_list`);
  const main=rows.find(row=>row.name==='main');
  if(main===undefined||typeof main.file!=='string'||main.file==='')throw new Error('actual retirement database path is absent');
  return main.file;
}

test('retirement119 native insert refuses a bound definition without changing any persistent row',()=>runProfileCase(async fixture=>{
  await defineStep(fixture);
  const before=fixture.readEvidence();
  await expectRefusal(()=>fixture.source.db.run(sql`INSERT INTO step_retirement(step_id,organization_id,retired_at,retired_by) VALUES(${STEP},${fixture.seed.organizationId},${fixture.seed.stamp.at},${fixture.seed.stamp.by})`),/step definition is still bound/);
  expect(fixture.readEvidence()).toEqual(before);
}),30000);

test('retirement119 composite ownership FK refuses a foreign retirement without changing any persistent row',()=>runProfileCase(async fixture=>{
  await defineStep(fixture);await unbindStep(fixture);
  const before=fixture.readEvidence();
  await expectRefusal(()=>fixture.source.db.run(sql`INSERT INTO step_retirement(step_id,organization_id,retired_at,retired_by) VALUES(${STEP},${fixture.seed.foreignOrganizationId},${fixture.seed.stamp.at},${fixture.seed.stamp.by})`),/FOREIGN KEY constraint failed/);
  expect(fixture.readEvidence()).toEqual(before);
  expect(fixture.source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
}),30000);

for(const mutation of ['update','delete']as const){
  test('retirement119 native '+mutation+' refuses an immutable retirement',()=>runProfileCase(async fixture=>{
    await retireStep(fixture);const before=fixture.readEvidence();
    await expectRefusal(()=>fixture.source.db.run(mutation==='update'?sql`UPDATE step_retirement SET retired_at=retired_at+1 WHERE step_id=${STEP}`:sql`DELETE FROM step_retirement WHERE step_id=${STEP}`),/step retirement is immutable/);
    expect(fixture.readEvidence()).toEqual(before);
  }),30000);
}

test('retirement119 native binding refuses implicit reactivation of a retired definition',()=>runProfileCase(async fixture=>{
  await retireStep(fixture);const before=fixture.readEvidence();
  await expectRefusal(()=>fixture.source.db.run(sql`INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin) VALUES('retired-rebind',${fixture.seed.organizationId},'organization',${fixture.seed.organizationId},${STEP},NULL,10,'authored')`),/step definition is retired/);
  expect(fixture.readEvidence()).toEqual(before);
}),30000);

test('retirement119 current readers refuse a corrupt binding to a retired physical definition',()=>runProfileCase(async fixture=>{
  await retireStep(fixture);
  expect(await fixture.source.stores.workPackages.stepsOf(fixture.seed.workPackageId)).toEqual([]);
  fixture.source.db.run(sql`DROP TRIGGER step_binding_active_insert`);
  fixture.source.db.run(sql`INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin) VALUES('retired-corrupt-binding',${fixture.seed.organizationId},'organization',${fixture.seed.organizationId},${STEP},NULL,10,'authored')`);
  expect(fixture.source.db.all(sql`SELECT id FROM step_binding WHERE id='retired-corrupt-binding'`)).toEqual([{id:'retired-corrupt-binding'}]);
  await expectRefusal(()=>fixture.port.readCatalogue(fixture.seed.organizationId),/retired definition/);
  await expectRefusal(()=>fixture.source.stores.workPackages.stepsOf(fixture.seed.workPackageId),/retired definition/);
}),30000);

test('retirement119 current catalogue refuses a missing applied profile instead of returning an active catalogue',()=>runProfileCase(async fixture=>{
  await defineStep(fixture);
  const row=fixture.source.db.all<{name:unknown}>(sql`SELECT name FROM __drizzle_migrations WHERE name='20261118210000_add_step_retirements'`);
  expect(row).toEqual([{name:'20261118210000_add_step_retirements'}]);
  fixture.source.db.run(sql`DELETE FROM __drizzle_migrations WHERE name='20261118210000_add_step_retirements'`);
  await expectRefusal(()=>fixture.port.readCatalogue(fixture.seed.organizationId),/retirement profile header/);
  await expectRefusal(()=>fixture.source.stores.workPackages.stepsOf(fixture.seed.workPackageId),/retirement profile header/);
  expect(fixture.source.db.all(sql`SELECT id FROM step_definition WHERE id=${STEP}`)).toEqual([{id:STEP}]);
}),30000);

test('retirement119 down refuses recorded retirements and preserves the complete schema and migration ledger',()=>runProfileCase(async(fixture,custody)=>{
  await retireStep(fixture);const before=fixture.readEvidence();
  await expectRefusal(()=>rollbackProfile(fixture,custody),/downgrade would reactivate identities/);
  expect(fixture.readEvidence()).toEqual(before);
  expect(fixture.source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
}),30000);

test('retirement119 empty down reverses exactly the additive relation and ordinary migration can reapply it',()=>runProfileCase(async(fixture,custody)=>{
  await defineStep(fixture);
  const ledger=fixture.source.db.all<{name:unknown}>(sql`SELECT * FROM __drizzle_migrations ORDER BY name COLLATE BINARY`);
  const schema=fixture.source.db.all<{name:unknown}>(sql`SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY`);
  const values=fixture.readEvidence().packageValues;
  expect(fixture.source.db.all(sql`SELECT * FROM step_retirement`)).toEqual([]);
  expect(rollbackProfile(fixture,custody)).toEqual(['20261118210000_add_step_retirements']);
  expect(fixture.source.db.all(sql`SELECT name FROM sqlite_master WHERE name='step_retirement'`)).toEqual([]);
  expect(fixture.source.db.all(sql`SELECT id FROM step_definition WHERE id=${STEP}`)).toEqual([{id:STEP}]);
  await expectRefusal(()=>fixture.port.readCatalogue(fixture.seed.organizationId),/retirement profile header/);
  expect(fixture.source.db.all(sql`SELECT * FROM __drizzle_migrations ORDER BY name COLLATE BINARY`)).toEqual(ledger.filter(row=>row.name!==MIGRATION));
  const removed=new Set(['step_retirement','step_retirement_requires_unbound','step_retirement_immutable_update','step_retirement_immutable_delete','step_binding_active_insert','step_binding_active_update']);
  expect(fixture.source.db.all(sql`SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY`)).toEqual(schema.filter(row=>{if(typeof row.name!=='string')throw new Error('actual schema name is malformed');return !removed.has(row.name)&&row.name!=='sqlite_autoindex_step_retirement_1';}));
  expect(fixture.readEvidence().packageValues).toEqual(values);
  reapplyProfile(fixture,custody);
  expect((await fixture.port.readCatalogue(fixture.seed.organizationId))?.definitions.map(row=>row.id)).toEqual([STEP]);
}),30000);
