import type {StepUnitWritten} from '@wbs/core';
import {sql} from 'drizzle-orm';
import {expect} from 'bun:test';
import {CURRENT_UNIT_ASSERTIONS,runCurrentUnitCase} from '@wbs/conformance/stores/current-unit';
import {test} from 'bun:test';

import {openSqliteStepCatalogueCase} from './step-catalogue-fixture';

for(const owner of CURRENT_UNIT_ASSERTIONS){
  test('current unit sqlite '+owner.caseId,async()=>{
    const fixture=await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
    await runCurrentUnitCase(fixture,owner.assert);
  },30000);
}

test('current unit sqlite queued stamp is retained before its actual Source writer turn',async()=>{
  const opened=await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
  await runCurrentUnitCase(opened,async()=>{
    await CURRENT_UNIT_ASSERTIONS[0].assert(opened);
    const {source,seed}=opened;
    const stamp={by:seed.stamp.by,at:seed.stamp.at+111};
    const originalAt=stamp.at;
    const captured:{pending:Promise<{ok:true;value:StepUnitWritten}|{ok:false;cause:unknown}>|undefined}={pending:undefined};
    const writer=await source.uow.run(()=>{
      captured.pending=source.stores.workPackages.setStepUnit(seed.workPackageId,'current-unit-shared','workdays',stamp)
        .then(value=>({ok:true as const,value}),(cause:unknown)=>({ok:false as const,cause}));
      stamp.at+=999;
      return Promise.resolve({commit:false,value:'queued stamp hold released'});
    }).then(value=>({ok:true as const,value}),(cause:unknown)=>({ok:false as const,cause}));
    const pending=captured.pending;
    if(pending===undefined){if(!writer.ok)throw writer.cause;throw new Error('actual queued unit operation was not captured');}
    const written=await pending;
    if(!writer.ok&&!written.ok)throw new AggregateError([writer.cause,written.cause],'unit queue hold and actual write failed');
    if(!writer.ok)throw writer.cause;
    if(!written.ok)throw written.cause;
    expect(writer.value).toBe('queued stamp hold released');
    expect(stamp.at).toBe(originalAt+999);
    expect(written.value).toMatchObject({ok:true,step:{estimateUnit:'workdays'}});
    expect(source.db.all(sql`SELECT updated_at AS "updatedAt" FROM work_package WHERE id=${seed.workPackageId}`)).toEqual([{updatedAt:originalAt}]);
  });
},30000);
