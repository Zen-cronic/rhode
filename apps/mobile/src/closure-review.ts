import type {State} from './api';
export type ClosureReview={assignmentId:string;assignmentVersion:number;assignmentStatus:string;closures:{id:string;reason:string;source_ref:string;observed_at:string;area:{west:number;east:number;south:number;north:number}}[];receipts:{route_revision_id:string;acknowledged_by:string;acknowledged_at:string}[];revisions:{id:string;revision:number;status:string;approved_at?:string;body:{assignmentVersion:number;loadVersion:number;closures:{id:string}[];resources?:{id:string;version:number}[];drivingMinutes?:number;dutyMinutes?:number;completionAt?:string;hasToll?:boolean;reasons:string[];route?:any}}[]};
export function closureDecision(data:ClosureReview,state:State,revision:ClosureReview['revisions'][number]){
 const trip=state.assignments.find(t=>t.id===data.assignmentId),load=state.loads.find(l=>l.id===trip?.loadId);
 const covered=data.closures.length===revision.body.closures.length&&data.closures.every(c=>revision.body.closures.some(v=>v.id===c.id));
 const latest=data.revisions.filter(r=>r.status==='approved').sort((a,b)=>(b.approved_at??'').localeCompare(a.approved_at??'')||b.id.localeCompare(a.id))[0];
 const receipt=data.receipts.find(r=>r.route_revision_id===revision.id);
 const stale=!trip||trip.status!=='accepted'||!covered||revision.status==='pending'&&(trip.version!==revision.body.assignmentVersion||load?.version!==revision.body.loadVersion||(revision.body.resources??[]).some(r=>state.resources.find(x=>x.id===r.id)?.version!==r.version));
 return {stale,receipt,canApprove:!stale&&revision.status==='pending',canReceive:!stale&&revision.status==='approved'&&latest?.id===revision.id&&!receipt};
}
export function closureGeometry(route:any){
 const legs=route?.route?.trip?.legs;
 if(route?.routing_evidence!=='valhalla-truck'||!Array.isArray(legs)||!legs.length)return null;
 const coordinates=legs.map((l:any)=>l.shape?.type==='LineString'?l.shape.coordinates:null);
 if(coordinates.some((leg:any)=>!Array.isArray(leg)||leg.length<2||leg.some((p:any)=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)))return null;
 return coordinates.map((leg:number[][])=>leg.map(([longitude,latitude])=>({longitude,latitude})));
}
