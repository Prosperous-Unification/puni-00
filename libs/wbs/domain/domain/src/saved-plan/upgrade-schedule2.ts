import type {SavedCanonicalStageV2,SavedPlacement,SavedConnectedScheduleEvidence,SavedOptimizationVariant} from './connected-schedule';
import type {SavedCanonicalStageV1, SavedPlacement as LegacyPlacement, SavedConnectedScheduleEvidence as LegacyEvidence, SavedOptimizationVariant as LegacyVariant} from './legacy-connected-schedule2';
import {detachHistory} from './history-json';

/** Project only owned host fields; original canonical packet bytes and tuple identities remain stored separately. */
export function upgradeCanonicalStage1(packet:SavedCanonicalStageV1):SavedCanonicalStageV2 {
 const {projectId,projects,elsewhere,...facts}=packet;
 return detachHistory({...facts,workPackageId:projectId,workPackages:projects.map(({projectId,...member})=>({...member,workPackageId:projectId})),elsewhere:elsewhere.map(({bookings,...person})=>({...person,bookings:bookings.map(({projectId,...booking})=>({...booking,workPackageId:projectId}))}))});
}
/** Rename captured floor/holder vocabulary without running an engine or changing offsets. */
export function upgradeLegacyPlacement2(placement:LegacyPlacement):SavedPlacement {
 return detachHistory({...placement,slices:Object.fromEntries(Object.entries(placement.slices).map(([key,slice])=>{
  const {boundBy,elsewhereHolder,...timing}=slice;
  return [key,{...timing,boundBy:boundBy==='projectStart'?'workPackageStart':boundBy,...(elsewhereHolder===undefined?{}:{elsewhereHolder:{workPackageId:elsewhereHolder.projectId,workItemId:elsewhereHolder.workItemId}})}];
 }))});
}
type LegacyQuestion=Extract<LegacyVariant,{state:'ready'}>['candidate']['question'];
/** Keep all original question hashes/configuration/stageBytes while projecting its owning package label. */
function upgradeQuestion2(question:LegacyQuestion) {const {projectId,...identity}=question;return {...identity,workPackageId:projectId};}
/** Preserve objective state and original question identity; only owned scope and placement names change. */
function upgradeVariant2(variant:LegacyVariant):SavedOptimizationVariant {
 if(variant.state==='boundary-infeasible')return {...variant,certificate:{...variant.certificate,question:upgradeQuestion2(variant.certificate.question)}};
 if(variant.state!=='ready')return variant;
 const {projectId,...scope}=variant.decision.scope;
 return {...variant,candidate:{...variant.candidate,question:upgradeQuestion2(variant.candidate.question)},decision:{...variant.decision,scope:{...scope,workPackageId:projectId},schedule:upgradeLegacyPlacement2(variant.decision.schedule),baseline:upgradeLegacyPlacement2(variant.decision.baseline)}};
}
/** Legacy read projection keeps every packet string and identity hash; it never creates a fresh v2 capture. */
export function upgradeConnectedEvidence2(evidence:LegacyEvidence):SavedConnectedScheduleEvidence {
 const {targetProjectId,idleProjects,baseline,composite,stages,...capture}=evidence;
 return detachHistory({...capture,targetWorkPackageId:targetProjectId,idleWorkPackages:idleProjects,baseline:upgradeLegacyPlacement2(baseline),composite:upgradeLegacyPlacement2(composite),stages:stages.map(({projectId,variants,...stage})=>({...stage,workPackageId:projectId,variants:variants===null?null:{pri:upgradeVariant2(variants.pri),time:upgradeVariant2(variants.time)}}))});
}
