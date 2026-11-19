import {parseDependencyReceipt} from '@wbs/contracts/dependency-runtime';
import {WorkPackageStepMissing} from '@wbs/core';
import {workItemRow} from '@wbs/core/testing/work-item-fixture';
import {expect,test} from 'bun:test';
import {sql,type Logger} from 'drizzle-orm';

import {inspectDependencyActivation} from '../cross-work-package-dependency-activation';
import {readStepBlockageActivation} from '../step-blockage-activation';
import {openSqliteStepCatalogueCase} from './step-catalogue-fixture';

type Fixture=Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const SHARED='cross-reference-shared-step',MAIN='cross-reference-main',SIBLING='cross-reference-sibling',PEER='cross-reference-peer';

async function withinCase(exercise:(fixture:Fixture)=>Promise<void>,logger?:Logger):Promise<void>{
  const fixture=await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview',logger);
  let primary:{cause:unknown}|undefined;
  try{await exercise(fixture);}catch(cause:unknown){primary={cause};}
  try{await fixture.close();}catch(cleanup:unknown){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'catalogue crossing owner and Source close failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
}

async function seedScope(fixture:Fixture):Promise<void>{
  const {port,source,seed}=fixture;
  expect((await port.defineAndBindStep(seed.organizationId,{
    id:SHARED,code:'cross-reference-shared',name:'Cross reference shared step',position:10,
    defaultEstimateUnit:'workdays',defaultAllowancePercent:0,
  },{bindingId:'cross-reference-binding',scopeKind:'organization',scopeId:seed.organizationId,
    workItemTypeId:null,position:10},seed.stamp)).ok).toBe(true);
  for(const[id,workPackageId,position]of [
    [MAIN,seed.workPackageId,10],[PEER,seed.workPackageId,20],[SIBLING,seed.siblingWorkPackageId,10],
  ]as const)await source.stores.workItems.insert(workItemRow({id,workPackageId,name:id,position}),[],seed.stamp);
  expect(source.db.all(sql`SELECT work_package_id,step_id FROM work_package_step WHERE step_id=${SHARED} ORDER BY work_package_id COLLATE BINARY`)).toEqual([
    {work_package_id:seed.workPackageId,step_id:SHARED},{work_package_id:seed.siblingWorkPackageId,step_id:SHARED},
  ].sort((left,right)=>left.work_package_id<right.work_package_id?-1:left.work_package_id>right.work_package_id?1:0));
  source.db.run(sql`INSERT INTO person(id,name) VALUES('cross-reference-person','Cross reference person')`);
  source.db.run(sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES('cross-reference-person',${seed.organizationId},'Cross reference person')`);
  // Fixture-local admission, validated by the actual ledger/trigger reader; no host participant authority.
  expect(readStepBlockageActivation(source.db)).toBe('DISABLED');
  source.db.run(sql`UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1`);
  expect(readStepBlockageActivation(source.db)).toBe('ENABLED');
  expect(source.db.all('PRAGMA foreign_key_check')).toEqual([]);
  expect(source.db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='step'`)).toEqual([]);
}

/** Literal current point families; independent of any production fact registry or query builder. */
const POINTS=[
  {table:'estimate',kind:'estimate_step',suffix:'',columns:'optimistic,realistic,pessimistic',values:'1,2,3'},
  {table:'actual',kind:'actual_step',suffix:'',columns:'days,recorded_at',values:'2,20'},
  {table:'step_progress',kind:'step_progress_step',suffix:'',columns:'state,stated_at',values:"'in_progress',20"},
  {table:'step_measure',kind:'step_measure_step',suffix:'/hours_actual',columns:'metric,value,recorded_at',values:"'hours_actual',2,20"},
  {table:'measure_estimate',kind:'measure_estimate_step',suffix:'/tokens',columns:'measure_key,optimistic,realistic,pessimistic',values:"'tokens',1,2,3"},
  {table:'step_node_attempt',kind:'step_node_attempt_step',suffix:'/1',columns:'attempt_number,started_at',values:'1,20'},
  {table:'step_node_attempt_issued',kind:'step_node_attempt_issued_step',suffix:'',columns:'issued',values:'3'},
  {table:'assignment',kind:'assignment_step',suffix:'/cross-reference-person',columns:'person_id',values:"'cross-reference-person'"},
  {table:'claim',kind:'claim_step',suffix:'',columns:'id,person_id,lease_expires_at',values:"'cross-reference-claim','cross-reference-person',300"},
  {table:'step_blockage',kind:'step_blockage_step',suffix:'',columns:'blocked_at',values:'20'},
  {table:'step_parallel',kind:'step_parallel_step',suffix:'',columns:'max_parallel',values:'2'},
]as const;

function insertPoint(fixture:Fixture,point:typeof POINTS[number],workItemId=MAIN):void{
  fixture.source.db.run(sql`INSERT INTO ${sql.raw(point.table)}(work_item_id,step_id,${sql.raw(point.columns)}) VALUES(${workItemId},${SHARED},${sql.raw(point.values)})`);
  expect(fixture.source.db.all(sql`SELECT work_item_id,step_id FROM ${sql.raw(point.table)} WHERE work_item_id=${workItemId} AND step_id=${SHARED}`)).toEqual([{work_item_id:workItemId,step_id:SHARED}]);
}

async function expectHealthy(fixture:Fixture):Promise<void>{
  const before=fixture.readEvidence().snapshot;
  expect(await fixture.source.stores.workPackages.findCrossReferences(fixture.seed.workPackageId,fixture.seed.organizationId)).toEqual([]);
  expect(fixture.readEvidence().snapshot).toEqual(before);
}

/** Fixture-only corrupt trusted state is installed after a real healthy census; no trigger is removed. */
function deleteTrusted(fixture:Fixture,table:'work_package_step'|'step_definition',workPackageId=fixture.seed.workPackageId):void{
  const {db}=fixture.source;
  db.run(sql`PRAGMA foreign_keys=OFF`);
  try{
    if(table==='work_package_step')db.run(sql`DELETE FROM work_package_step WHERE work_package_id=${workPackageId} AND step_id=${SHARED}`);
    else db.run(sql`DELETE FROM step_definition WHERE id=${SHARED}`);
  }finally{db.run(sql`PRAGMA foreign_keys=ON`);}
  expect(db.all('PRAGMA foreign_keys')).toEqual([{foreign_keys:1}]);
  expect(db.all(table==='work_package_step'?sql`SELECT step_id FROM work_package_step WHERE work_package_id=${workPackageId} AND step_id=${SHARED}`:sql`SELECT id FROM step_definition WHERE id=${SHARED}`)).toEqual([]);
}

test('catalogue crossing census admits every current point family on an organization-shared definition without mutation',async()=>{
  await withinCase(async fixture=>{
    await seedScope(fixture);
    expect(POINTS.map(point=>point.table)).toEqual(['estimate','actual','step_progress','step_measure','measure_estimate','step_node_attempt','step_node_attempt_issued','assignment','claim','step_blockage','step_parallel']);
    for(const point of POINTS)insertPoint(fixture,point);
    await expectHealthy(fixture);
  });
},15000);

for(const point of POINTS){
  test('catalogue crossing census refuses missing explicit package values for '+point.table,async()=>{
    await withinCase(async fixture=>{
      await seedScope(fixture);insertPoint(fixture,point);await expectHealthy(fixture);
      deleteTrusted(fixture,'work_package_step');
      const before=fixture.readEvidence().snapshot;
      await expect(fixture.source.stores.workPackages.findCrossReferences(fixture.seed.workPackageId,fixture.seed.organizationId)).rejects.toThrow(WorkPackageStepMissing);
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);
  test('catalogue crossing census refuses a missing trusted definition for '+point.table,async()=>{
    await withinCase(async fixture=>{
      await seedScope(fixture);insertPoint(fixture,point);await expectHealthy(fixture);
      deleteTrusted(fixture,'step_definition');
      const before=fixture.readEvidence().snapshot;
      await expect(fixture.source.stores.workPackages.findCrossReferences(fixture.seed.workPackageId,fixture.seed.organizationId)).rejects.toThrow('definition');
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);
  test('catalogue crossing census reports a foreign definition for '+point.table,async()=>{
    await withinCase(async fixture=>{
      await seedScope(fixture);insertPoint(fixture,point);await expectHealthy(fixture);
      fixture.source.db.run(sql`UPDATE step_definition SET organization_id=${fixture.seed.foreignOrganizationId} WHERE id=${SHARED}`);
      const before=fixture.readEvidence().snapshot;
      expect<unknown>(await fixture.source.stores.workPackages.findCrossReferences(fixture.seed.workPackageId,fixture.seed.organizationId)).toEqual([
        {kind:point.kind,id:point.table==='claim'?'cross-reference-claim':MAIN+'/'+SHARED+point.suffix},
      ]);
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);
}

test('catalogue crossing census keeps a sibling-only missing pair local instead of inventing an incoming shared-step edge',async()=>{
  await withinCase(async fixture=>{
    await seedScope(fixture);insertPoint(fixture,POINTS[0]);insertPoint(fixture,POINTS[0],SIBLING);
    await expectHealthy(fixture);
    expect(await fixture.source.stores.workPackages.findCrossReferences(fixture.seed.siblingWorkPackageId,fixture.seed.organizationId)).toEqual([]);
    deleteTrusted(fixture,'work_package_step',fixture.seed.siblingWorkPackageId);
    const before=fixture.readEvidence().snapshot;
    expect(await fixture.source.stores.workPackages.findCrossReferences(fixture.seed.workPackageId,fixture.seed.organizationId)).toEqual([]);
    await expect(fixture.source.stores.workPackages.findCrossReferences(fixture.seed.siblingWorkPackageId,fixture.seed.organizationId)).rejects.toThrow(WorkPackageStepMissing);
    expect(fixture.readEvidence().snapshot).toEqual(before);
  });
},15000);

test('catalogue crossing census retains identity-only issued history on a parent',async()=>{
  await withinCase(async fixture=>{
    await seedScope(fixture);
    insertPoint(fixture,POINTS[6]);
    await fixture.source.stores.workItems.insert(workItemRow({id:'cross-reference-child',workPackageId:fixture.seed.workPackageId,parentId:MAIN,name:'Child',position:10}),[],fixture.seed.stamp);
    expect(fixture.source.db.all(sql`SELECT work_item_id,step_id,issued FROM step_node_attempt_issued`)).toEqual([{work_item_id:MAIN,step_id:SHARED,issued:3}]);
    await expectHealthy(fixture);
  });
},15000);

test('catalogue crossing census permits a null-step subtree claim without suppressing person ownership',async()=>{
  await withinCase(async fixture=>{
    await seedScope(fixture);
    fixture.source.db.run(sql`INSERT INTO claim(id,work_item_id,step_id,person_id) VALUES('cross-reference-subtree',${MAIN},NULL,'cross-reference-person')`);
    await expectHealthy(fixture);
    fixture.source.db.run(sql`INSERT INTO person(id,name) VALUES('cross-reference-foreign-person','Foreign cross reference person')`);
    fixture.source.db.run(sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES('cross-reference-foreign-person',${fixture.seed.foreignOrganizationId},'Foreign cross reference person')`);
    fixture.source.db.run(sql`UPDATE claim SET person_id='cross-reference-foreign-person' WHERE id='cross-reference-subtree'`);
    expect(await fixture.source.stores.workPackages.findCrossReferences(fixture.seed.workPackageId,fixture.seed.organizationId)).toEqual([{kind:'claim_person',id:'cross-reference-subtree'}]);
  });
},15000);

/** Both independent columns of each relationship; a whole opposite end carries no step. */
const ENDPOINTS=[['typed_dependency','predecessor'],['typed_dependency','successor'],['external_dependency','predecessor'],['external_dependency','successor']]as const;
/** Uses the same actual local receipt/marker inspector as the external first-child owner. */
async function activateExternalFixture(fixture:Fixture):Promise<void>{
  const {source,seed}=fixture;
  expect(inspectDependencyActivation(source.db)).toEqual({state:'DISABLED',receipt:null});
  const receipt=parseDependencyReceipt({
    protocol:'wbs-dependency-activation',version:1,activationId:'cross-reference-census',
    databaseIdentity:fixture.fixtureId,candidateImage:'wbs@sha256:'+'a'.repeat(64),rollbackImage:'wbs@sha256:'+'b'.repeat(64),
    participantProofSha256:'c'.repeat(64),migrationCaptureSha256:'d'.repeat(64),activatedAt:seed.stamp.at,
  });
  await source.uow.run(()=>{
    source.db.run(sql`INSERT INTO cross_work_package_dependency_activation_receipt(id,receipt) VALUES(1,${JSON.stringify(receipt)})`);
    source.db.run(sql`UPDATE cross_work_package_dependency_activation SET state='ENABLED' WHERE id=1`);
    return Promise.resolve({commit:true,value:undefined});
  });
  expect(inspectDependencyActivation(source.db)).toEqual({state:'ENABLED',receipt});
}
async function insertEndpoint(fixture:Fixture,table:typeof ENDPOINTS[number][0],side:typeof ENDPOINTS[number][1]):Promise<void>{
  const {source,seed}=fixture;
  if(table==='external_dependency')await activateExternalFixture(fixture);
  const predecessor=side==='predecessor'?MAIN:(table==='typed_dependency'?PEER:SIBLING);
  const successor=side==='successor'?MAIN:(table==='typed_dependency'?PEER:SIBLING);
  const columns='id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type';
  const values=sql`'cross-reference-link',${predecessor},${side==='predecessor'?'node':'whole'},${side==='predecessor'?SHARED:null},${successor},${side==='successor'?'node':'whole'},${side==='successor'?SHARED:null},'FS'`;
  if(table==='typed_dependency')source.db.run(sql`INSERT INTO typed_dependency(work_package_id,${sql.raw(columns)}) VALUES(${seed.workPackageId},${values})`);
  else source.db.run(sql`INSERT INTO external_dependency(organization_id,predecessor_work_package_id,successor_work_package_id,${sql.raw(columns)}) VALUES(${seed.organizationId},${side==='predecessor'?seed.workPackageId:seed.siblingWorkPackageId},${side==='successor'?seed.workPackageId:seed.siblingWorkPackageId},${values})`);
  expect(source.db.all(sql`SELECT id FROM ${sql.raw(table)}`)).toEqual([{id:'cross-reference-link'}]);
}
for(const[table,side]of ENDPOINTS){
  test('catalogue crossing census validates exact package values for '+table+'.'+side,async()=>{
    await withinCase(async fixture=>{
      await seedScope(fixture);await insertEndpoint(fixture,table,side);await expectHealthy(fixture);
      deleteTrusted(fixture,'work_package_step');
      const before=fixture.readEvidence().snapshot;
      await expect(fixture.source.stores.workPackages.findCrossReferences(fixture.seed.workPackageId,fixture.seed.organizationId)).rejects.toThrow(WorkPackageStepMissing);
      expect(fixture.readEvidence().snapshot).toEqual(before);
    });
  },15000);
}


/** Faithful bound replay of captured SQL; a literal question mark refuses instead of guessing. */
function explainStatement(fixture:Fixture,statement:{sql:string;params:unknown[]}):{detail:string}[]{
  const fragments=statement.sql.split('?');
  if(fragments.length!==statement.params.length+1)throw new Error('census EXPLAIN placeholder contract is unsupported');
  const explanation=sql.raw('EXPLAIN QUERY PLAN ');
  for(const[index,fragment]of fragments.entries()){
    explanation.append(sql.raw(fragment));
    if(index<statement.params.length)explanation.append(sql`${statement.params.at(index)}`);
  }
  return fixture.source.db.all<{detail:string}>(explanation);
}

test('catalogue crossing census plans every current fact family in one indexed statement',async()=>{
  const statements:{sql:string;params:unknown[]}[]=[];
  await withinCase(async fixture=>{
    await seedScope(fixture);
    for(const point of POINTS)insertPoint(fixture,point);
    statements.length=0;
    expect(await fixture.source.stores.workPackages.findCrossReferences(fixture.seed.workPackageId,fixture.seed.organizationId)).toEqual([]);
    const captured=statements.splice(0);
    expect(captured).toHaveLength(1);
    const statement=captured.at(0);
    if(statement===undefined)throw new Error('current census issued no statement');
    for(const table of ['estimate','actual','step_progress','step_measure','measure_estimate','step_node_attempt','step_node_attempt_issued','assignment','claim','step_blockage','step_parallel','typed_dependency','external_dependency']){
      expect(statement.sql).toContain('FROM '+table+' AS l');
    }
    const plan=explainStatement(fixture,statement);
    expect(plan.length).toBeGreaterThan(0);
    const scans=plan.map(({detail})=>detail).filter(detail=>/^SCAN (w|d|l|pre|suc|parent|definition|package_values|work_item|dependency|typed_dependency|external_dependency)\b/.test(detail));
    expect(scans).toEqual([]);
  },{logQuery:(query,params)=>{statements.push({sql:query,params});}});
},15000);
