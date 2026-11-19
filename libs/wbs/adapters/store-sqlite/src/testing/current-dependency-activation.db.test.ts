import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {expect,test} from 'bun:test';
import {sql} from 'drizzle-orm';

import {inspectDependencyActivation} from '../cross-work-package-dependency-activation';
import {type Drizzle,openExistingConnection} from '../db';
import {runMigrations} from '../migrate';
import {readMigrationFolders} from '../migrate-down';
import {copyRecoveryPrefix} from './recovery-state';
import {MIGRATIONS_FOLDER} from './space-database';
import {openSqliteStepCatalogueCase} from './step-catalogue-fixture';

const predecessor='20261115120000_add_step_migration_report';
const actions=['insert','update','delete'] as const;
type Action=(typeof actions)[number];
type Fixture=Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const normalize=(statement:string)=>statement.replace(/\s+/g,' ').trim().replace(/;$/,'');

function readTrigger(db:Drizzle,action:Action):string{
  const rows=db.all<{sql:unknown}>(sql`SELECT sql FROM sqlite_master WHERE type='trigger' AND name=${'external_dependency_admit_'+action}`);
  expect(rows).toHaveLength(1);
  const statement=rows.at(0)?.sql;
  if(typeof statement!=='string'||statement.length===0)throw new Error('actual activation trigger is absent');
  return statement;
}

/** Expected trigger text comes from the actual immutable migration artifact, not the inspector's template. */
function migrationTrigger(folder:string,action:Action):string{
  const script=readFileSync(join(MIGRATIONS_FOLDER,folder,'migration.sql'),'utf8');
  const matched=script.match(new RegExp('CREATE TRIGGER external_dependency_admit_'+action+'\\n[\\s\\S]*?\\nEND;'));
  if(matched===null)throw new Error('activation trigger missing from actual migration artifact');
  return matched[0];
}

/** Actual111 renames cause SQLite to quote these two identifiers in retained116 trigger SQL. */
function predecessorTrigger(action:Action):string{
  const rename=readFileSync(join(MIGRATIONS_FOLDER,'20261110100000_rename_project_to_work_package','migration.sql'),'utf8');
  expect(rename).toContain('ALTER TABLE `cross_project_dependency_activation` RENAME TO `cross_work_package_dependency_activation`;');
  expect(rename).toContain('ALTER TABLE `cross_project_dependency_activation_receipt` RENAME TO `cross_work_package_dependency_activation_receipt`;');
  return migrationTrigger('20261022212000_add_cross_project_dependency_activation',action)
    .replaceAll('cross_project_dependency_activation_receipt','"cross_work_package_dependency_activation_receipt"')
    .replaceAll('cross_project_dependency_activation','"cross_work_package_dependency_activation"');
}

async function withinCurrent(act:(fixture:Fixture)=>Promise<void>):Promise<void>{
  const fixture=await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
  let primary:{cause:unknown}|undefined;
  try{await act(fixture);}catch(cause:unknown){primary={cause};}
  try{await fixture.close();}catch(cleanup:unknown){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'activation owner and current Source close failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
}

test('activation inspection retains the actual116 quoted trigger contract',()=>{
  const directory=mkdtempSync(join(tmpdir(),'activation-quoted-predecessor-')),path=join(directory,'source.db');
  let connection:ReturnType<typeof openExistingConnection>|undefined;
  let unknownOwner=false,primary:{cause:unknown}|undefined;
  try{
    const prefix=copyRecoveryPrefix(directory,predecessor);
    const expected=readMigrationFolders(prefix).map(({name,hash})=>({name,hash}));
    expect(expected).toHaveLength(116);
    try{runMigrations(path,prefix);}catch(cause:unknown){unknownOwner=true;throw cause;}
    try{connection=openExistingConnection(path);}catch(cause:unknown){unknownOwner=true;throw cause;}
    expect(connection.db.all(sql`SELECT name,hash FROM __drizzle_migrations ORDER BY name`)).toEqual(expected);
    for(const action of actions){
      const actual=readTrigger(connection.db,action);
      expect(normalize(actual)).toBe(normalize(predecessorTrigger(action)));
      expect(actual).toContain('FROM "cross_work_package_dependency_activation"');
    }
    expect(inspectDependencyActivation(connection.db)).toEqual({state:'DISABLED',receipt:null});
  }catch(cause:unknown){primary={cause};}
  if(connection!==undefined){
    try{connection.close();}catch(cleanup:unknown){
      unknownOwner=true;
      if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'quoted predecessor inspection and close failed; retained '+directory,{cause:cleanup});
      throw cleanup;
    }
  }
  if(!unknownOwner){
    try{rmSync(directory,{recursive:true});}catch(cleanup:unknown){
      if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'quoted predecessor inspection and cleanup failed',{cause:cleanup});
      throw cleanup;
    }
  }
  if(primary!==undefined)throw primary.cause;
  if(unknownOwner)throw new Error('quoted predecessor owner uncertain; retained '+directory);
},30000);

test('activation inspection accepts actual117 unquoted guards without changing persisted state',async()=>{
  await withinCurrent(async(fixture)=>{
    for(const action of actions){
      const actual=readTrigger(fixture.source.db,action);
      expect(normalize(actual)).toBe(normalize(migrationTrigger('20261115130000_add_step_catalogue',action)));
      expect(actual).toContain('FROM cross_work_package_dependency_activation');
    }
    const before=fixture.readEvidence();
    expect(inspectDependencyActivation(fixture.source.db)).toEqual({state:'DISABLED',receipt:null});
    expect(fixture.readEvidence()).toEqual(before);
  });
},30000);

for(const action of actions)for(const corruption of ['missing','altered'] as const){
  test('activation inspection refuses actual117 '+corruption+' '+action+' guard',async()=>{
    await withinCurrent(async(fixture)=>{
      const {source}=fixture;
      expect(inspectDependencyActivation(source.db)).toEqual({state:'DISABLED',receipt:null});
      const original=readTrigger(source.db,action);
      const before=fixture.readEvidence();
      await source.uow.run(()=>{
        source.db.run(sql.raw('DROP TRIGGER external_dependency_admit_'+action));
        if(corruption==='altered'){
          const needle="state = 'ENABLED'";
          if(original.split(needle).length!==2)throw new Error('activation state predicate is not unique');
          source.db.run(sql.raw(original.replace(needle,"state = 'DISABLED'")));
        }
        // Observe the real public inspector while the exact selected native
        // dependency is broken. The actual UoW then restores all DDL by rollback.
        expect(()=>inspectDependencyActivation(source.db)).toThrow('invalid dependency activation triggers');
        return Promise.resolve({commit:false,value:undefined});
      });
      expect(readTrigger(source.db,action)).toBe(original);
      expect(fixture.readEvidence()).toEqual(before);
      expect(inspectDependencyActivation(source.db)).toEqual({state:'DISABLED',receipt:null});
    });
  },30000);
}
