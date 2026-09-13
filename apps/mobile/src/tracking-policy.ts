export type TrackingGrant={id:string;scope:string;origin:string;userId:string;carrierId:string;driverId:string;sessionId:string;assignmentId:string;startedAt:string;expiresAt:string;enabled:boolean;emulator?:boolean};
export type TrackingState={capabilities?:{emulatorTracking?:boolean};visits?:{assignment_id:string;departure:string|null}[];actor?:{role:string;driverId?:string;carrierId:string};workSessions?:{id:string;ended_at:string|null;started_at?:string}[];assignments:{id:string;driverId:string;loadId:string;status:string}[];loads:{id:string;provenance:string}[]};
export function trackingBlock(grant:TrackingGrant,state:TrackingState,now:number,permissionGranted:boolean):string|null{
 if(!grant.enabled)return 'Tracking authorization was revoked.';
 if(!permissionGranted)return 'Background location permission was revoked.';
 if(!Number.isFinite(Date.parse(grant.expiresAt))||now>=Date.parse(grant.expiresAt))return 'Sign-in token expired. Open Rhode to renew tracking.';
 if(state.actor?.role!=='driver'||state.actor.driverId!==grant.driverId||state.actor.carrierId!==grant.carrierId)return 'Driver identity or carrier changed.';
 if(!state.workSessions?.some(s=>s.id===grant.sessionId&&s.ended_at===null))return 'Work session ended.';
 const assignment=state.assignments.find(a=>a.id===grant.assignmentId&&a.driverId===grant.driverId&&(a.status==='accepted'||(a.status==='completed'&&state.visits?.some(v=>v.assignment_id===a.id&&v.departure===null))));
 if(!assignment)return 'Trip is no longer accepted or awaiting an existing visit departure for this driver.';
 if(!state.loads.some(l=>l.id===assignment.loadId&&(grant.emulator?state.capabilities?.emulatorTracking===true&&l.provenance==='synthetic':l.provenance==='live')))return 'Only live trips can share device GPS.';
 return null;
}
export function validSample(grant:TrackingGrant,at:number,accuracy:number|null,now:number){return Number.isFinite(at)&&at>=Date.parse(grant.startedAt)&&at<=now+60000&&at<Date.parse(grant.expiresAt)&&accuracy!==null&&Number.isFinite(accuracy)&&accuracy>=0;}
