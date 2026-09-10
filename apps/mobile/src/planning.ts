export type PlanningRun={id:string;version:number;status:string;created_at?:string;input:{now:string;vehicles:{id:string;driverId:string;truckId:string;trailerId:string}[];versions:{id:string;kind:string;version:number}[]};result:{routes:{vehicle_id:string;stops:{load_id:string;stop:'pickup'|'delivery';minute:number}[];driving_minutes:number;duty_minutes:number}[];infeasible_loads:{load_id?:string;vehicle_id?:string;reason:string}[];input_hash?:string;routing_evidence?:string;assumptions?:string[]}};
export type GroupStop={assignmentId:string;loadId:string;stop:'pickup'|'delivery';stopId:string;point:{id:string;name:string;lat:number;lng:number};minute:number};
export type TripGroup={id:string;driver_id:string;status:string;version:number;body:{driverId:string;truckId:string;trailerId:string;stops:GroupStop[];startAt:string;endAt:string;drivingMinutes:number;dutyMinutes:number;assumptions?:string[];routingEvidence:string;inputHash:string;provenance:string}};
export type Manifest={assignment_id:string;body:{groupId?:string};created_at?:string};
type Snapshot={actor?:{role:string;driverId?:string};assignments:{id:string;version:number;status:string}[];loads:{id:string;version:number}[];resources:{id:string;version:number}[];stopCompletions?:{assignment_id:string;stop_id:string}[];tripGroups?:TripGroup[];planningRuns?:PlanningRun[]};
export type Intent={path:string;body:Record<string,string>;version:number;label:string};
export function stopCompleted(stop:GroupStop,done:NonNullable<Snapshot['stopCompletions']>){return done.some(d=>d.assignment_id===stop.assignmentId&&d.stop_id===stop.stopId);}
export function nextGroupStop(group:TripGroup,done:NonNullable<Snapshot['stopCompletions']>){return group.body.stops.find(stop=>!stopCompleted(stop,done));}
export function groupIntent(state:Snapshot,groupId:string,action:'accept'|'reject'|'complete',review?:{groupVersion:number;assignmentId:string;assignmentVersion:number;stopId?:string}):Intent{
 const group=state.tripGroups?.find(g=>g.id===groupId);if(!group)throw new Error('Manifest is no longer available.');
 if(state.actor?.role!=='driver'||state.actor.driverId!==group.driver_id)throw new Error('Only the assigned driver may execute this manifest.');
 const stop=action==='complete'?nextGroupStop(group,state.stopCompletions??[]):group.body.stops[0];const assignment=state.assignments.find(a=>a.id===stop?.assignmentId);
 if(!stop||!assignment)throw new Error('No actionable manifest stop is available.');
 if(group.status!==(action==='complete'?'accepted':'offered')||assignment.status!==(action==='complete'?'accepted':'offered'))throw new Error('Manifest status changed. Refresh and review it again.');
 if(review&&(review.groupVersion!==group.version||review.assignmentId!==assignment.id||review.assignmentVersion!==assignment.version||action==='complete'&&review.stopId!==stop.stopId))throw new Error('The manifest or assignment changed during review. Review the current next action.');
 return action==='complete'?{path:'/api/complete-stop',body:{assignmentId:assignment.id,stopId:stop.stopId},version:assignment.version,label:`Complete manifest ${stop.loadId} ${stop.stop}`}:{path:'/api/respond',body:{assignmentId:assignment.id,action},version:assignment.version,label:`${action==='accept'?'Accept':'Reject'} entire manifest ${group.id}`};
}
export function planIssue(state:Snapshot,run:PlanningRun):string|null{
 if(state.actor?.role!=='dispatcher')return 'Only dispatchers may approve planning proposals.';
 const current=state.planningRuns?.find(p=>p.id===run.id);if(!current||current.version!==run.version||current.status!==run.status||run.status!=='proposal')return 'This planning record changed or is already resolved.';
 if(!run.result.routes.length||run.result.routing_evidence!=='valhalla-truck'||!run.result.input_hash)return 'A feasible route with verified truck-route evidence is required.';
 if(run.input.versions.some(v=>(v.kind==='load'?state.loads:state.resources).find(x=>x.id===v.id)?.version!==v.version))return 'Planning inputs changed. Compute and review a new proposal.';
 return null;
}
export function planIntent(state:Snapshot,run:PlanningRun):Intent{const issue=planIssue(state,run);if(issue)throw new Error(issue);return {path:'/api/approve-plan',body:{planId:run.id},version:run.version,label:`Approve shared-route plan ${run.id}`};}
export function plannedTime(at:string,minute=0){const time=Date.parse(at)+minute*60000;return Number.isFinite(time)?new Date(time).toLocaleString('en-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'Scenario time unavailable';}
