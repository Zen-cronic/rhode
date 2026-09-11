import {useState,useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {mileagePath,mileageMatches} from '@roadstar/domain/tracking';
import type {MileageReport} from '@roadstar/domain/tracking';
import {request} from './api';
import type {State,Session} from './api';
import {sampleNumber} from './tracking-model';
const when=(value:string)=>new Date(value).toLocaleString('en-CA',{timeZone:'America/Toronto',dateStyle:'medium',timeStyle:'short'});
export function Mileage({state,session,online}:{state:State;session:Session;online:boolean}){
 const [selection,setSelection]=useState('');
 const choices=[...state.assignments.map(a=>({value:`assignment:${a.id}`,label:`Trip ${a.loadId} · ${a.driverId} · ${a.truckId} · ${a.id.slice(0,8)}`})),...(state.workSessions??[]).map(s=>({value:`session:${s.id}`,label:`Work session · ${s.driver_id??'Driver'} · ${s.started_at?when(s.started_at):s.id.slice(0,8)} ET · ${s.ended_at?'Ended':'Active'}`}))];
 const allowed=choices.some(c=>c.value===selection);
 const query=useQuery({queryKey:['mileage',session.carrier,session.uid,selection],queryFn:async()=>{const result=await request<MileageReport>(session,mileagePath(selection));if(!mileageMatches(result,selection))throw new Error('Report did not match the selected scope.');return result;},enabled:allowed&&online,retry:false,refetchInterval:15000});
 useEffect(()=>{if(allowed&&online)void query.refetch();},[state.cursor]);
 const report=allowed&&query.data&&mileageMatches(query.data,selection)?query.data:null;
 return <section aria-label="Mileage report" className="selected-sample">
  <div className="panel-heading"><div><p className="eyebrow">Distance & coverage</p><h3>Trip & work-session mileage</h3></div><span className="tag">Retained observations</span></div>
  <label>Report scope<select aria-label="Mileage report scope" value={selection} onChange={e=>setSelection(e.target.value)}><option value="">Choose a trip or work session</option>{choices.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
  {!choices.length&&<p className="empty">No trips or work sessions are available.</p>}
  {selection&&<><button disabled={!online||query.isFetching} onClick={()=>void query.refetch()}>{query.isFetching?'Refreshing mileage…':'Refresh mileage'}</button>{!online&&<p role="status" className="notice">Offline. Any report shown is the last downloaded result; it does not include unsynchronized observations.</p>}{query.isLoading&&online&&<p role="status">Loading retained mileage…</p>}{query.isError&&<p role="alert" className="error">Report refresh failed: {query.error.message}. Any previous result remains dated below.</p>}</>}
  {report&&<><p className="fine">Report as of {when(report.asOf)} ET · {report.samples} retained samples · {report.driverId}</p>{report.evidencePolicy==='occurrence-ordered-v2'&&<p className="notice">Occurrence-ordered report · {report.lateSamples??0} late samples retained. Usable intervals include late evidence; current GPS and source observations are unchanged. {report.timestampConflictSamples??0} equal-time samples excluded.</p>}{report.startedAt&&<p className="fine">Session {when(report.startedAt)} → {report.endedAt?when(report.endedAt):'Active at report time'} ET</p>}
   {!report.samples?<p className="empty">No retained samples in this scope. Distance is unknown.</p>:<><p><strong>Reported odometer increments: {sampleNumber(report.odometerKm,'km')}</strong></p><p>GPS chord estimate: {sampleNumber(report.gpsChordKm,'km')}</p><div className="tracking-samples">{report.legs.map(leg=><article className="tracking-sample" key={leg.assignmentId}><h4>{leg.loadId} · {leg.truckId}</h4><p>{leg.provenance.join(', ')} · {leg.samples} samples</p><p>Odometer {sampleNumber(leg.odometerKm,'km')} · GPS estimate {sampleNumber(leg.gpsChordKm,'km')}</p><p className="fine">{sampleNumber(leg.observedSeconds/60,'min')} of linked observations · {leg.unlinkedIntervals} excluded intervals · {leg.missingOdometerIntervals} linked intervals without usable odometer</p>{leg.firstAt&&leg.lastAt&&<p className="fine">Observed {when(leg.firstAt)} → {when(leg.lastAt)} ET</p>}</article>)}</div></>}
   <p className="notice">All retained samples are included, beyond the breadcrumb page below. Unrecorded travel and gaps remain unknown. Totals cover usable intervals only; GPS chords are estimates, not road mileage. Trips are never joined. Work sessions are tracking boundaries, not certified HOS shifts.</p>
  </>}
 </section>;
}
