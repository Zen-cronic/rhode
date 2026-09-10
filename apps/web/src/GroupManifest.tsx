import { useState } from "react";
import type { SendCommand, Session, State, TripGroup, TripGroupStop } from "./api";
import { Modal } from "./ReviewDialog";
import { downloadOriginal } from "./Documents";
import { nextGroupStop, stopCompleted } from "./planning-model";
export function GroupManifest({group,state,session,send,lastError,online}:{group:TripGroup;state:State;session:Session;send:SendCommand;lastError?:string;online:boolean}) {
  const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[downloadError,setDownloadError]=useState('');
  const [review,setReview]=useState<{stop:TripGroupStop;version:number}|null>(null),[note,setNote]=useState('');
  const completions=state.stopCompletions??[];
  const next=nextGroupStop(group,completions);
  const leader=state.assignments.find(assignment=>assignment.id===group.body.stops[0]?.assignmentId);
  const nextAssignment=state.assignments.find(assignment=>assignment.id===next?.assignmentId);
  const loads=new Set(group.body.stops.map(stop=>stop.loadId));
  const isDriver=state.actor.role==='driver';
  const stale=!!review&&(next?.assignmentId!==review.stop.assignmentId||next?.stopId!==review.stop.stopId||nextAssignment?.version!==review.version||group.status!=='accepted');
  async function respond(action:'accept'|'reject') {if(!leader)return;setBusy(true);setFailed(false);const ok=await send('respond',{assignmentId:leader.id,action},leader.version);setBusy(false);setFailed(!ok);}
  return <article className="trip-card group-manifest">
    <div className="panel-heading"><div><p className="eyebrow">Shared route · one manifest</p><h3>{loads.size} load{loads.size===1?'':'s'} · {group.body.stops.length} ordered stops</h3></div><span className={`tag status-${group.status}`}>{group.status}</span></div>
    <p>{group.body.driverId} · Truck {group.body.truckId} · Trailer {group.body.trailerId}</p>
    <p className="fine">{group.body.provenance} · {group.body.routingEvidence} · {group.body.drivingMinutes} modeled driving minutes · {group.body.dutyMinutes} modeled duty minutes</p>
    {group.status==='offered'&&<><p className="notice">Acceptance or rejection applies to every load and stop in this manifest. Review the complete sequence before responding.</p>{isDriver&&<div className="actions"><button className="primary" disabled={!online||busy||!leader} onClick={()=>void respond('accept')}>{busy?'Sending response…':'Accept entire manifest'}</button><button disabled={!online||busy||!leader} onClick={()=>void respond('reject')}>Reject entire manifest</button></div>}</>}
    {group.status==='accepted'&&next&&<div className="next-manifest-stop"><p className="eyebrow">Next action</p><h3>{next.stop==='pickup'?'Pick up':'Deliver'} {next.loadId}</h3><p>{next.point.name}</p>{isDriver&&<button className="primary" disabled={!online||busy||!nextAssignment||nextAssignment.status!=='accepted'} onClick={()=>{setNote('');setFailed(false);setReview({stop:next,version:nextAssignment!.version});}}>Review next stop completion</button>}</div>}
    {group.status==='completed'&&<p className="notice">All stops are completed. This manifest remains available for reference.</p>}
    <ol className="ordered-stops">{group.body.stops.map((stop,index)=>{const complete=stopCompleted(stop,completions);return <li key={`${stop.assignmentId}-${stop.stopId}`} aria-current={group.status==='accepted'&&next===stop?'step':undefined}><strong>{index+1}. {stop.loadId} · {stop.stop}</strong><span>{stop.point.name}</span><small>{complete?'Completed':group.status==='accepted'&&next===stop?'Next stop':'Awaiting execution'}</small>{state.facilityNotes?.filter(item=>item.load_id===stop.loadId&&item.stop_id===stop.stopId).map(item=>{const source=state.documents?.find(doc=>doc.id===item.document_id);return <div className="facility-note" key={item.id}><strong>Reviewed instructions</strong><p>{item.instructions}</p><small>Source revision {item.document_version}</small>{source&&<button onClick={()=>void downloadOriginal(session,source).catch(error=>setDownloadError(error.message))}>Download instruction source</button>}</div>;})}</li>;})}</ol>
    {!!group.body.assumptions?.length&&<details><summary>Planning assumptions</summary><ul>{group.body.assumptions.map((value,index)=><li key={index}>{value}</li>)}</ul></details>}
    {failed&&!review&&<p role="alert" className="error">{lastError||'The response was not confirmed. Review command activity before retrying.'}</p>}
    {downloadError&&<p role="alert" className="error">{downloadError}</p>}
    {review&&<Modal title="Complete next manifest stop" description={`${review.stop.loadId} · ${review.stop.stop} · ${review.stop.point.name}`} onClose={()=>setReview(null)}><p>Confirm this stop is complete. This records an execution event; it does not establish a billing arrival or departure timestamp.</p><form onSubmit={async event=>{event.preventDefault();setBusy(true);setFailed(false);const ok=await send('complete-stop',{assignmentId:review.stop.assignmentId,stopId:review.stop.stopId,note},review.version);setBusy(false);if(ok)setReview(null);else setFailed(true);}}><label>Completion note (optional)<textarea aria-label="Completion note (optional)" maxLength={2000} value={note} onChange={event=>setNote(event.target.value)}/></label>{stale&&<p className="notice">The manifest changed. Close this review and check the current next stop.</p>}{failed&&<p role="alert" className="error">{lastError||'Stop completion was not applied. Check the current manifest.'}</p>}<button className="primary" disabled={!online||busy||stale}>{busy?'Recording completion…':'Confirm stop complete'}</button></form></Modal>}
  </article>;
}
