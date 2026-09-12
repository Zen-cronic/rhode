import { useState } from "react";
import type { PlanningRun, PlanningVehicle, SendCommand, State } from "./api";
import { Modal } from "./ReviewDialog";
import { pairingError, plannedTime } from "./planning-model";
const emptyPair = (): PlanningVehicle => ({driverId:"",truckId:"",trailerId:""});
export function Planning({state,send,lastError,online}:{state:State;send:SendCommand;lastError?:string;online:boolean}) {
  const [loadIds,setLoadIds]=useState<string[]>([]),[vehicles,setVehicles]=useState<PlanningVehicle[]>([emptyPair()]);
  const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[review,setReview]=useState<PlanningRun|null>(null);
  const loads=state.loads.filter(load=>load.status==='open'&&load.provenance==='synthetic');
  const selected=loadIds.filter(id=>loads.some(load=>load.id===id));
  const pairingIssue=pairingError(vehicles);
  const runs=[...(state.planningRuns??[])].sort((a,b)=>(b.recorded_at??'').localeCompare(a.recorded_at??''));
  return <section className="panel planning-panel">
    <div className="panel-heading"><div><p className="eyebrow">Planning proposal</p><h2>Build a shared route</h2></div><span className="tag">Synthetic scenario</span></div>
    <p>Select loads and pair each driver with a truck and trailer. OR-Tools compares stop sequences using truck-route travel times. Review the result before offering any trips.</p>
    <p className="notice">Supported horizon: 24 hours from the scenario clock. Pickup is fixed at the supplied appointment; service time is split between pickup and delivery. A 26-pallet trailer allowance is assumed. These inputs need verification before live use.</p>
    <form onSubmit={async event=>{event.preventDefault();setBusy(true);setFailed(false);const ok=await send('optimize',{loadIds:selected,vehicles},0);setBusy(false);setFailed(!ok);}}>
      <fieldset disabled={busy||!online} className="planning-loads"><legend><span className="step-index">01</span> Loads to include · {selected.length}/20</legend>
        {!loads.length?<p className="empty">No open synthetic loads are available. Existing assignments use the recovery workflow.</p>:loads.map(load=><label className="checkbox-label" key={load.id}><input type="checkbox" checked={selected.includes(load.id)} disabled={selected.length>=20&&!selected.includes(load.id)} onChange={event=>setLoadIds(event.target.checked?[...selected,load.id]:selected.filter(id=>id!==load.id))}/><span><strong>{load.id} · {load.mode}</strong><br/>{load.pickup.name} → {load.delivery.name}<br/><small>{load.equipment} · {load.weightLb?.toLocaleString()??'Unknown'} lb · {load.pallets} pallets</small></span></label>)}
      </fieldset>
      <fieldset disabled={busy||!online} className="planning-vehicles"><legend><span className="step-index">02</span> Explicit vehicle pairings</legend>
        {vehicles.map((vehicle,index)=><div className="planning-pair" key={index}>
          {([['driverId','driver','Driver'],['truckId','truck','Truck'],['trailerId','trailer','Trailer']] as const).map(([field,kind,caption])=><label key={field}>{caption} {index+1}<select aria-label={`${caption} ${index+1}`} value={vehicle[field]} onChange={event=>setVehicles(vehicles.map((value,i)=>i===index?{...value,[field]:event.target.value}:value))} required><option value="">Choose {kind}</option>{state.resources.filter(resource=>resource.kind===kind).map(resource=><option key={resource.id} value={resource.id} disabled={vehicles.some((pair,i)=>i!==index&&pair[field]===resource.id)}>{resource.id}{resource.name?` · ${resource.name}`:''}{resource.equipment?` · ${resource.equipment}`:''}</option>)}</select></label>)}
          <button type="button" disabled={vehicles.length===1} aria-label={`Remove pairing ${index+1}`} onClick={()=>setVehicles(vehicles.filter((_,i)=>i!==index))}>Remove</button>
        </div>)}
        <button type="button" disabled={vehicles.length>=8} onClick={()=>setVehicles([...vehicles,emptyPair()])}>Add vehicle pairing</button>
      </fieldset>
      {pairingIssue&&<p className="fine">{pairingIssue}</p>}
      {failed&&<p role="alert" className="error">{lastError||'Planning could not be completed. Review command activity and retry the original request if its connection failed.'}</p>}
      <button className="primary" disabled={busy||!online||!selected.length||!!pairingIssue}>{busy?'Computing truck routes and stop sequences…':'Compute planning proposal'}</button>
      {busy&&<p role="status">Computing the road matrix and constrained route. Existing assignments remain in place.</p>}
    </form>
    <div className="planning-results"><p className="eyebrow">PROPOSAL REGISTER</p><h3>Planning history</h3>{!runs.length?<p className="empty">No planning runs yet. Computed proposals will appear here.</p>:runs.map(run=><article className="evidence-row" key={run.id}><div><strong>{run.result.routes.length} route{run.result.routes.length===1?'':'s'} · {run.result.infeasible_loads.length} unresolved input{run.result.infeasible_loads.length===1?'':'s'}</strong><p className="fine">Revision {run.version} · {run.status} · {run.input.now?plannedTime(run.input.now,0):'Clock unavailable'} ET</p>{run.recorded_at&&<p className="fine">Computed {plannedTime(run.recorded_at,0)} ET</p>}</div><button onClick={()=>setReview(run)}>Review planning {run.status==='approved'?'record':'proposal'}</button></article>)}</div>
    {review&&<PlanReview run={review} state={state} send={send} lastError={lastError} online={online} onClose={()=>setReview(null)}/>}
  </section>;
}
function PlanReview({run,state,send,lastError,online,onClose}:{run:PlanningRun;state:State;send:SendCommand;lastError?:string;online:boolean;onClose:()=>void}){
  const [ack,setAck]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const current=state.planningRuns?.find(item=>item.id===run.id);
  const stale=current?.version!==run.version||current.status!==run.status||run.input.versions.some(input=>{const record=input.kind==='load'?state.loads.find(load=>load.id===input.id):state.resources.find(resource=>resource.id===input.id);return record?.version!==input.version;});
  const supported=run.result.routing_evidence==='valhalla-truck'&&!!run.result.input_hash;
  return <Modal title="Review shared-route proposal" description={`Planning revision ${run.version} · ${run.status}. Times below are scenario appointments in Eastern time.`} onClose={onClose}>
    {run.result.routes.map((route,index)=>{const vehicle=run.input.vehicles.find(item=>item.id===route.vehicle_id);return <article className="plan-route" key={`${route.vehicle_id}-${index}`}><h3>Route {index+1} · {route.vehicle_id}</h3><p>{vehicle?.driverId??'Unknown driver'} · {vehicle?.truckId??'Unknown truck'} · {vehicle?.trailerId??'Unknown trailer'}</p><p className="fine">{vehicle?.available_at!==undefined&&<>Available after committed work: {plannedTime(run.input.now,vehicle.available_at)} ET · </>}{route.driving_minutes} driving minutes · {route.duty_minutes} duty minutes · modeled plan</p><ol className="ordered-stops">{route.stops.map((stop,i)=>{const load=state.loads.find(item=>item.id===stop.load_id);return <li key={`${stop.load_id}-${stop.stop}-${i}`}><strong>{stop.load_id} · {stop.stop}</strong><span>{load?.[stop.stop].name??'Stop unavailable'}</span><small>{plannedTime(run.input.now,stop.minute)} ET</small></li>;})}</ol></article>;})}
    {!run.result.routes.length&&<p className="notice">No feasible routes were returned. No trips can be offered from this result.</p>}
    {!!run.result.infeasible_loads.length&&<><h3>Unresolved inputs</h3><ul>{run.result.infeasible_loads.map((item,index)=>{const load=state.loads.find(load=>load.id===item.load_id);return <li key={index}><strong>{item.load_id??item.vehicle_id??'Input'}</strong> — {item.reason}{load&&<p className="fine">Requested pickup: {load.pickup.name} · {plannedTime(load.startAt,0)} ET</p>}</li>;})}</ul><p className="fine">Unresolved loads remain unassigned. A bounded search result does not prove that no alternative exists.</p></>}
    <h3>Evidence and assumptions</h3><p className="fine">{run.result.routing_evidence??'Truck-route evidence unavailable'}</p>{run.result.input_hash&&<code className="planning-hash">{run.result.input_hash}</code>}
    <ul>{(run.result.assumptions??[]).map((assumption,index)=><li key={index}>{assumption}</li>)}<li>Supplied service duration is split between pickup and delivery.</li></ul>
    {run.status==='proposal'&&<form onSubmit={async event=>{event.preventDefault();setBusy(true);setFailed(false);const ok=await send('approve-plan',{planId:run.id},run.version);setBusy(false);if(ok)onClose();else setFailed(true);}}>
      <label className="checkbox-label"><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/><span>I reviewed the vehicle pairings, ordered stops, unresolved loads and modeled assumptions.</span></label>
      {stale&&<p role="status" className="notice">Planning inputs changed. Close this review and compute a new proposal.</p>}
      {!supported&&<p className="notice">Verified truck-route evidence is required before approval.</p>}
      {failed&&<p role="alert" className="error">{lastError||'Approval was not applied. Refresh and recompute if the proposal is stale.'}</p>}
      <button className="primary" disabled={!ack||busy||stale||!supported||!online||!run.result.routes.length}>{busy?'Rechecking route evidence…':'Approve plan and offer manifests'}</button>
      <p className="fine">The server rechecks versions, current commitments and the road matrix before reserving all resources atomically. Drivers must accept the resulting manifests.</p>
    </form>}
  </Modal>;
}
