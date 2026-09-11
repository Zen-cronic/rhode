import type {State} from './api';
export function recoveryState(proposal:State['proposals'][number],state:State){
 const load=state.loads.find(l=>l.id===proposal.load_id);
 const previous=state.assignments.find(a=>a.id===proposal.body.currentAssignmentId);
 const resulting=proposal.status==='approved'?state.assignments.find(a=>a.loadId===proposal.load_id&&a.driverId===proposal.body.driverId&&!['superseded','rejected'].includes(a.status)):undefined;
 const stale=proposal.status==='pending'&&(!load||(proposal.expected_version!==undefined&&load.version!==proposal.expected_version)||(proposal.body.resources??[]).some((r:{id:string;version:number})=>state.resources.find(v=>v.id===r.id)?.version!==r.version));
 return {load,previous,resulting,stale,canApprove:proposal.status==='pending'&&!stale&&proposal.body.proof?.eligible===true};
}
