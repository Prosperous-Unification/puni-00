import type {WorkPackageStore} from '../../ports/work-package-store';

/**
 * The existing Source/loan assertion admits this single purpose at call entry.
 * Primitive address/unit and detached stamp are retained before queueing. Public
 * memory composition also binds this inside the coordinator; SQLite's actual
 * write gate rechecks its turn. Current factories complete mutation synchronously,
 * so a later close cannot retroactively cancel an already-admitted write.
 * Other capabilities retain their actual target receiver and ownership.
 */
export function retainPackageUnitWrites<Store extends Pick<WorkPackageStore,'setStepUnit'>>(store:Store,assertOpen:()=>void):Store{
  return new Proxy(store,{
    get(target,key,receiver){
      if(key==='setStepUnit')return async(...args:Parameters<WorkPackageStore['setStepUnit']>)=>{
        assertOpen();
        const [workPackageId,stepId,unit,stamp]=args,act={...stamp};
        return await target.setStepUnit(workPackageId,stepId,unit,act);
      };
      const member:unknown=Reflect.get(target,key,receiver);
      return typeof member==='function'?(...args:unknown[]):unknown=>Reflect.apply(member,target,args):member;
    },
  });
}
