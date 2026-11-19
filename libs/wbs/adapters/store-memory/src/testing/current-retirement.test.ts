import {stepCatalogueFixtureFromSource} from '@wbs/conformance';
import {CURRENT_RETIREMENT_ASSERTIONS,runCurrentRetirementCase} from '@wbs/conformance/stores/current-retirement';
import {test} from 'bun:test';
import {openMemoryStepCatalogueCase} from './step-catalogue-fixture';

for(const owner of CURRENT_RETIREMENT_ASSERTIONS){
  test('current retirement memory '+owner.caseId,async()=>{
    const current=await openMemoryStepCatalogueCase(owner.caseId,stepCatalogueFixtureFromSource);
    await runCurrentRetirementCase({current,readDefinitions(){
      const snapshot=current.readEvidence().snapshot;
      if(typeof snapshot!=='object'||snapshot===null)throw new Error('actual memory snapshot is absent');
      const catalogue:unknown=Reflect.get(snapshot,'stepCatalogue');
      if(typeof catalogue!=='object'||catalogue===null)throw new Error('actual memory catalogue is absent');
      const definitions:unknown=Reflect.get(catalogue,'definitions');
      if(!(definitions instanceof Map))throw new Error('actual memory definitions are absent');
      return [...definitions.entries()];
    }},owner.assert);
  },30000);
}
