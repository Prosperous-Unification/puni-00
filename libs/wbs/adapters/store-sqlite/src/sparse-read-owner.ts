import {type Connection,type Drizzle,observeCommitted} from './db';

interface SparseStepReads{
  listByWorkPackage(workPackageId:string):Promise<readonly{readonly workItemId:string;readonly stepId:string}[]>;
  listByWorkItems(workPackageId:string,ids:readonly string[]):Promise<readonly{readonly workItemId:string;readonly stepId:string}[]>;
}

/**
 * Public sparse observations use Source's existing committed read pool, never its writer
 * gate. The surrounding Source lifetime guard runs before an empty target fast path;
 * nonempty calls own one actual read transaction and its existing pooled release.
 * Writes keep the original store receiver/gate. No new lifetime authority is acquired.
 */
export function ownSparseStepReads<Store extends SparseStepReads>(
  writer:Store,openConnection:()=>Connection,createReader:(snapshot:Drizzle)=>Store,
):Store{
  const read=<Value>(project:(reader:Store)=>Promise<Value>)=>observeCommitted(openConnection,snapshot=>project(createReader(snapshot)));
  return new Proxy(writer,{
    get(target,key,receiver){
      switch(key){
        case 'listByWorkPackage':return(workPackageId:string)=>read(reader=>reader.listByWorkPackage(workPackageId));
        case 'listByWorkItems':return(workPackageId:string,ids:readonly string[])=>{
          const retained=[...ids];
          if(retained.length===0)return Promise.resolve([]);
          return read(reader=>reader.listByWorkItems(workPackageId,retained));
        };
      }
      const member:unknown=Reflect.get(target,key,receiver);
      return typeof member==='function'?(...args:unknown[]):unknown=>Reflect.apply(member,target,args):member;
    },
  });
}
