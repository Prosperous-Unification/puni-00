import {createHash} from 'node:crypto';
import {chmodSync,copyFileSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,test} from 'bun:test';
import {sql} from 'drizzle-orm';
import {type Drizzle,openReadOnlyConnection} from '../db';
import {runMigrations} from '../migrate';
import {readMigrationFolders} from '../migrate-down';
import {openSqliteSource,type SqliteSource} from '../source';
import {isSqliteCleanupUnknown} from '../sqlite-cleanup';
import {readStepIdentityIn} from '../step-identity';
import {CAPABLE_BACKEND_DEPENDENCY_CAPABILITY} from './dependency-capability';
import {MIGRATIONS_FOLDER} from './space-database';

const directoryName='resource-use-117-merged',databaseName='merged-bound.db',logicalName='merged-bound.state.json';
const databaseDigest='328193592561074712e3f16db0b9a4d947698517c8a789c125acd6c93a51314a';
const logicalDigest='0df92993f422f3d3cd22079962d18b1ffc7da11bc3f941321754d357c3c619ba';
const organizationId='merged-resource-org',workPackageId='merged-resource-old-package',survivor='a-resource-dev';
const stamp={at:200,by:'merged-resource-author'};

function digest(bytes:Uint8Array){return createHash('sha256').update(bytes).digest('hex');}
function capture(db:Drizzle){
  const schema=db.all<Record<string,unknown>>(sql`SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY`);
  const tables=db.all<{name:unknown}>(sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name COLLATE BINARY`).map(({name})=>{
    if(typeof name!=='string'||name==='')throw new Error('actual retirement fixture table name is malformed');
    const rows=db.all<Record<string,unknown>>(sql.raw('SELECT * FROM "'+name.replaceAll('"','""')+'"'));
    rows.sort((left,right)=>Buffer.compare(Buffer.from(JSON.stringify(left)),Buffer.from(JSON.stringify(right))));
    return{name,rows};
  });
  const ledger=db.all<{name:string;hash:string}>(sql`SELECT name,hash FROM __drizzle_migrations ORDER BY name COLLATE BINARY`);
  return{schema,tables,ledger};
}

/** Genuine117 artifact and complete logical/ledger equality precede current Source work; no fabricated alias or immutable record. */
test('current retirement preserves a genuine merged survivor and historical identity without rewriting retained records',async()=>{
  const original=join(import.meta.dir,'fixtures',directoryName);
  const originalDatabase=join(original,databaseName),logicalBytes=readFileSync(join(original,logicalName));
  expect(digest(readFileSync(originalDatabase))).toBe(databaseDigest);
  expect(digest(logicalBytes)).toBe(logicalDigest);
  const logical:unknown=JSON.parse(logicalBytes.toString('utf8'));
  const directory=mkdtempSync(join(tmpdir(),'wbs-retirement-merged-')),path=join(directory,'source.db');
  let source:SqliteSource|undefined;
  let unknownOwner=false;
  let primary:{cause:unknown}|undefined;
  try{
    copyFileSync(originalDatabase,path);chmodSync(path,0o600);
    expect(digest(readFileSync(path))).toBe(databaseDigest);
    let connection:ReturnType<typeof openReadOnlyConnection>;
    try{connection=openReadOnlyConnection(path);}catch(cause:unknown){unknownOwner=true;throw cause;}
    let inspected:{ok:true;state:ReturnType<typeof capture>}|{ok:false;cause:unknown};
    try{inspected={ok:true,state:capture(connection.db)};}catch(cause:unknown){inspected={ok:false,cause};}
    try{connection.close();}catch(cleanup:unknown){
      unknownOwner=true;
      if(!inspected.ok)throw new AggregateError([inspected.cause,cleanup],'merged retirement prestate read and close failed; retained '+directory,{cause:cleanup});
      throw cleanup;
    }
    if(!inspected.ok)throw inspected.cause;
    expect<unknown>(inspected.state).toEqual(logical);
    expect(inspected.state.ledger).toHaveLength(117);
    expect(inspected.state.ledger.at(-1)?.name).toBe('20261115130000_add_step_catalogue');
    const folders=readMigrationFolders(MIGRATIONS_FOLDER);
    expect<unknown>(folders.slice(0,117).map(({name,hash})=>({name,hash}))).toEqual(inspected.state.ledger);
    // The artifact already owns117; only actual later immutable folders run here.
    try{runMigrations(path,MIGRATIONS_FOLDER);}catch(cause:unknown){if(isSqliteCleanupUnknown(cause))unknownOwner=true;throw cause;}
    try{source=openSqliteSource({dbPath:path,dependencyCapability:CAPABLE_BACKEND_DEPENDENCY_CAPABILITY});}
    catch(cause:unknown){unknownOwner=true;throw cause;}
    expect<unknown>(capture(source.db).ledger).toEqual(folders.map(({name,hash})=>({name,hash})));
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    const catalogue=await source.stores.stepCatalogue.readCatalogue(organizationId);
    expect(catalogue?.definitions.map(({id})=>id)).toEqual([survivor]);
    expect(catalogue?.bindings.map(({bindingId})=>bindingId).sort()).toEqual(['migration:a-resource-dev','migration:z-resource-dev']);
    const identity=readStepIdentityIn(source.db,workPackageId);
    expect(identity).toEqual({kind:'catalogue',aliases:[{oldStepId:'z-resource-dev',stepId:survivor}]});
    const claims=await source.stores.claims.listByWorkPackage(workPackageId);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({id:'merged-resource-claim',stepId:survivor});
    await source.stores.claims.remove(claims,[],stamp);
    expect(await source.stores.claims.listByWorkPackage(workPackageId)).toEqual([]);
    if(catalogue===null)throw new Error('genuine merged organization catalogue is absent');
    for(const binding of catalogue.bindings)
      expect(await source.stores.stepCatalogue.unbindStep(organizationId,binding.bindingId,{dryRun:false},stamp)).toMatchObject({kind:'unbound'});
    const before=capture(source.db);
    expect(source.db.all(sql`SELECT work_package_id,allowance_revision FROM work_package_step ORDER BY work_package_id COLLATE BINARY`)).toEqual([
      {work_package_id:'merged-resource-old-package',allowance_revision:3},
      {work_package_id:'merged-resource-survivor-package',allowance_revision:7},
    ]);
    // Initial absent method is scaffolding RED; retained-history assertions only count when reached.
    expect(typeof source.stores.stepCatalogue.retireStepDefinition).toBe('function');
    expect(await source.stores.stepCatalogue.retireStepDefinition(organizationId,survivor,stamp)).toEqual({ok:true});
    expect(await source.stores.stepCatalogue.readCatalogue(organizationId)).toEqual({definitions:[],bindings:[]});
    expect(readStepIdentityIn(source.db,workPackageId)).toEqual(identity);
    const after=capture(source.db);
    expect(after.schema).toEqual(before.schema);expect(after.ledger).toEqual(before.ledger);
    // Only the new retirement relation may change. Every original current/history table remains exact.
    for(const stored of before.tables){
      if(stored.name==='step_retirement')continue;
      expect(after.tables.find(row=>row.name===stored.name)).toEqual(stored);
    }
    expect(source.db.all(sql`SELECT id FROM step_definition`)).toEqual([{id:survivor}]);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  }catch(cause:unknown){primary={cause};}
  if(source!==undefined){
    try{await source.close();}catch(cleanup:unknown){
      unknownOwner=true;
      primary={cause:primary===undefined?cleanup:new AggregateError([primary.cause,cleanup],'merged retirement exercise and Source close failed; retained '+directory,{cause:cleanup})};
    }
  }
  if(!unknownOwner){
    try{rmSync(directory,{recursive:true});}catch(cleanup:unknown){
      if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'merged retirement exercise and directory cleanup failed',{cause:cleanup});
      throw cleanup;
    }
  }
  if(primary!==undefined){
    if(unknownOwner)throw new Error('merged retirement custody is unknown; retained '+directory,{cause:primary.cause});
    throw primary.cause;
  }
  if(unknownOwner)throw new Error('merged retirement custody is unknown; retained '+directory);
},30000);
