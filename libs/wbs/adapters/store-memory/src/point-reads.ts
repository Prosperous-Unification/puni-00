import {readStoredActual,readStoredProgress,type ActualStore,type StepProgressStore} from '@wbs/core';

import type {MemoryActualTable} from './actual-fixture';
import {readMemoryStepFactsIn} from './estimate-reads';
import type {MemoryProgressTable} from './progress-fixture';
import type {MemoryStepWriteContext} from './step-write';

/** The required context captures the same committed/staged maps synchronously; late construction resolves the graph's mutual references. */
export function ownMemoryActualReads(writer:ActualStore,table:MemoryActualTable,captureContext:()=>MemoryStepWriteContext):ActualStore{
  const read=(workPackageId:string,ids:readonly string[]|null)=>readMemoryStepFactsIn(captureContext(),table.rows,workPackageId,ids,readStoredActual,'actual');
  return{
    ...writer,
    async listByWorkPackage(workPackageId){return read(workPackageId,null);},
    async listByWorkItems(workPackageId,ids){return read(workPackageId,ids);},
  };
}

/** Actual Source progress queries use its required current catalogue context, never an optional legacy StepStore. */
export function ownMemoryProgressReads(writer:StepProgressStore,table:MemoryProgressTable,captureContext:()=>MemoryStepWriteContext):StepProgressStore{
  const read=(workPackageId:string,ids:readonly string[]|null)=>readMemoryStepFactsIn(captureContext(),table.rows,workPackageId,ids,readStoredProgress,'progress');
  return{
    ...writer,
    async listByWorkPackage(workPackageId){return read(workPackageId,null);},
    async listByWorkItems(workPackageId,ids){return read(workPackageId,ids);},
  };
}
