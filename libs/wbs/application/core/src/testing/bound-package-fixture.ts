import type {NewStepBinding,NewStepDefinition,NewWorkPackage,Source,TransactionalStores,WorkPackage,WriteStamp} from '../index';

/** Explicit current catalogue author metadata; it is never derived from a legacy Step DTO. */
export interface FixtureStepBinding{
  readonly definition:NewStepDefinition;
  readonly binding:Omit<NewStepBinding,'stepId'>;
}

/**
 * Seeds a package and its exact author-declared bindings on one actual fixture
 * loan. The organization/parent/account must already exist. Empty legacy input
 * writes no old Step rows; each current define-and-bind then materializes explicit
 * package values. This supplies persisted metadata, never an admission answer.
 * @throws for refused package/catalogue setup; the real Source UoW rolls back.
 */
export async function createBoundFixturePackage(
  source:Source<TransactionalStores>,organizationId:string,workPackage:NewWorkPackage,
  bindings:readonly FixtureStepBinding[],stamp:WriteStamp,
):Promise<WorkPackage>{
  return await source.uow.run(async({stores})=>{
    const created=await stores.workPackages.create(workPackage,[],stamp);
    if(typeof created==='string')throw new Error('fixture package creation refused: '+created);
    for(const {definition,binding}of bindings){
      const defined=await stores.stepCatalogue.defineAndBindStep(organizationId,definition,binding,stamp);
      if(!defined.ok)throw new Error('fixture definition/binding refused: '+defined.reason);
    }
    return{commit:true,value:created};
  });
}
