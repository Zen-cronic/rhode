import {Mileage} from './Mileage';
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { request } from "./api";
import type { Session, State } from "./api";
import { loadMaps } from "./MapPanel";
import { appliedTrails, feedFreshness, dispositionLabel, mergeSamples, sampleNumber, trackingDistance, validPosition } from "./tracking-model";
import type { TrackingPage, TrackingPoint } from "./tracking-model";
const when=(at:string)=>new Date(at).toLocaleString('en-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});
export function Tracking({state,session,online}:{state:State;session:Session;online:boolean}){
  const assignments=state.assignments.filter(assignment=>state.actor.role==='dispatcher'||assignment.driverId===state.actor.driverId);
  const [assignmentId,setAssignmentId]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null);
  const permitted=assignments.some(assignment=>assignment.id===assignmentId);
  const history=useInfiniteQuery({
    queryKey:['tracking',session.carrier,session.uid,assignmentId],initialPageParam:undefined as string|undefined,
    queryFn:async({pageParam})=>{
      const data=await request<TrackingPage>(session,`tracking?assignmentId=${encodeURIComponent(assignmentId)}${pageParam?`&before=${encodeURIComponent(pageParam)}`:''}`);
      if(data.assignmentId!==assignmentId||!Array.isArray(data.points))throw new Error('Tracking response did not match the selected assignment.');
      return {...data,clientReceivedAt:performance.now()};
    },
    getNextPageParam:page=>page.nextBefore||undefined,
    enabled:!!assignmentId&&permitted&&online,retry:false,
  });
  useEffect(()=>{if(assignmentId&&permitted&&online)void history.refetch();},[state.cursor]);
  const samples=useMemo(()=>permitted?mergeSamples(history.data?.pages??[]):[],[history.data,permitted]);
  const distance=useMemo(()=>trackingDistance(samples),[samples]);
  const selected=samples.find(point=>point.id===selectedId);
  const applied=samples.filter(point=>point.disposition==='applied'&&validPosition(point));
  return <section className="panel tracking-panel">
    <div className="panel-heading"><div><p className="eyebrow">Recorded telemetry</p><h2>Tracking history</h2></div><span className="tag">Sample precision</span></div>
    <p>Inspect the recorded breadcrumbs and each sample's speed, odometer and GPS accuracy. This view does not start a tracking session.</p>
    <Mileage state={state} session={session} online={online}/>
    <label>Tracked assignment<select aria-label="Tracked assignment" value={assignmentId} onChange={event=>{setAssignmentId(event.target.value);setSelectedId(null);}}><option value="">Choose an assignment</option>{assignments.map(assignment=><option key={assignment.id} value={assignment.id}>{assignment.loadId} · {assignment.driverId} · {assignment.truckId} · {assignment.status} · {assignment.id.slice(0,8)}</option>)}</select></label>
    {!assignments.length&&<p className="empty">No assignments are available for this identity.</p>}
    {!assignmentId&&!!assignments.length&&<p className="empty">Choose a trip to inspect its recorded history.</p>}
    {!!assignmentId&&<>
      {!online&&<p className="notice" role="status">Offline. Showing downloaded samples only; reconnect to refresh history.</p>}
      {history.isLoading&&<p className="notice" role="status">Loading recorded samples…</p>}
      {history.isError&&<div role="alert" className="error"><p>{history.error.message}</p><button disabled={!online} onClick={()=>void history.refetch()}>Retry tracking history</button></div>}
      {!!history.data&&!samples.length&&<p className="empty">No telemetry samples have been recorded for this assignment. Waiting for the source to send its first observation.</p>}
      {!!samples.length&&<>
        <FeedStatus page={history.data?.pages[0]} historical={assignments.find(a=>a.id===assignmentId)?.status==='completed'}/>
        <div className="panel-heading"><p className="fine">{samples.length} loaded samples · {applied.length} applied coordinates · {samples.length-applied.length} excluded from the trail</p><button disabled={!online||history.isFetching} onClick={()=>void history.refetch()}>{history.isFetching?'Refreshing history…':'Refresh history'}</button></div>
        <p className="notice">Lines join consecutive applied samples only. Gaps break at excluded or poor GPS samples, intervals over two minutes, conflicting timestamps, source changes, or implied movement over 160 km/h after GPS uncertainty. These are display assumptions. The traveled path between samples is unknown; recorded timestamps are not authoritative boundary-crossing or billing times.</p>
        <p className="fine">Loaded history only · {distance.segments} separate segments · Reported odometer distance {sampleNumber(distance.odometerKm,'km')} across {distance.odometerIntervals} valid intervals. {distance.missingOdometerIntervals} linked intervals lack usable odometer readings.</p>
        <p className="fine">GPS chord estimate {sampleNumber(distance.gpsChordKm,'km')} across {distance.gpsIntervals} movements beyond GPS uncertainty. This estimate excludes gaps and stationary jitter; it is not vehicle mileage or a road-route measurement.</p>
        <BreadcrumbMap key={assignmentId} samples={samples} selected={selected}/>
        {selected&&<div className="selected-sample" aria-live="polite"><h3>Selected sample · {when(selected.at)} ET</h3><p><strong>{dispositionLabel(selected.disposition)}</strong> · {selected.provenance} · {selected.duty.replaceAll('_',' ')}</p><p>Speed {sampleNumber(selected.speedKph,'km/h')} · Odometer {sampleNumber(selected.odometerKm,'km')} · Accuracy {sampleNumber(selected.accuracyM,'m')}</p><p className="fine">Sampled {when(selected.at)} ET · Received {when(selected.recordedAt)} ET</p><code>{selected.id}</code>{validPosition(selected)&&<p className="fine">Recorded coordinate: {selected.position.lat}, {selected.position.lng}. Accuracy radius describes this sample only.</p>}<button onClick={()=>setSelectedId(null)}>Clear selected sample</button></div>}
        <p className="fine">Orange dots are recorded sample locations. Select a sample to inspect its reported accuracy radius.</p><h3>Sample history</h3><p className="fine">Newest first. Unknown measurements remain unknown; no speed or odometer values are inferred.</p>
        <ol className="tracking-samples">{[...samples].reverse().map(point=><li key={point.id} className={`tracking-sample disposition-${point.disposition}`}><div className="panel-heading"><button aria-pressed={selectedId===point.id} onClick={()=>setSelectedId(point.id)}>{when(point.at)} ET</button><span className={`tag ${point.disposition==='applied'?'status-accepted':'status-pending'}`}>{dispositionLabel(point.disposition)}</span></div><dl><div><dt>Speed</dt><dd>{sampleNumber(point.speedKph,'km/h')}</dd></div><div><dt>Odometer</dt><dd>{sampleNumber(point.odometerKm,'km')}</dd></div><div><dt>GPS accuracy</dt><dd>{sampleNumber(point.accuracyM,'m')}</dd></div></dl><p className="fine">{point.provenance} · {point.duty.replaceAll('_',' ')}</p><code>{point.id}</code></li>)}</ol>
        {history.hasNextPage&&<button disabled={!online||history.isFetching} onClick={()=>void history.fetchNextPage()}>{history.isFetchingNextPage?'Loading older samples…':'Load older samples'}</button>}
        {!history.hasNextPage&&<p className="fine">All available samples are loaded.</p>}
      </>}
    </>}
  </section>;
}
function BreadcrumbMap({samples,selected}:{samples:TrackingPoint[];selected?:TrackingPoint}){
  const ref=useRef<HTMLDivElement>(null),map=useRef<google.maps.Map|null>(null),fitted=useRef(false);
  const [ready,setReady]=useState(false),[error,setError]=useState('');
  const key=import.meta.env.VITE_GOOGLE_MAPS_KEY;
  const trails=useMemo(()=>appliedTrails(samples),[samples]);
  useEffect(()=>{let cancelled=false;if(!key)return;loadMaps(key).then(()=>{if(cancelled||!ref.current)return;map.current=new google.maps.Map(ref.current,{center:{lat:43.75,lng:-79.6},zoom:8,maxZoom:17,mapTypeControl:true,streetViewControl:false,fullscreenControl:true});setReady(true);}).catch(error=>{if(!cancelled)setError(error.message);});return()=>{cancelled=true;};},[key]);
  useEffect(()=>{if(!ready||!map.current)return;const items:(google.maps.Polyline|google.maps.Circle)[]=[];const bounds=new google.maps.LatLngBounds();for(const trail of trails){for(const sample of trail){bounds.extend(sample.position);items.push(new google.maps.Circle({map:map.current,center:sample.position,radius:12,fillColor:'#ac3716',fillOpacity:1,strokeOpacity:0}));}if(trail.length>1)items.push(new google.maps.Polyline({map:map.current,path:trail.map(point=>point.position),strokeColor:'#ac3716',strokeWeight:3,strokeOpacity:.85}));}if(!bounds.isEmpty()&&!fitted.current){map.current.fitBounds(bounds,32);fitted.current=true;}return()=>items.forEach(item=>item.setMap(null));},[ready,trails]);
  useEffect(()=>{if(!ready||!map.current||!selected||!validPosition(selected))return;const marker=new google.maps.Marker({map:map.current,position:selected.position,title:`${dispositionLabel(selected.disposition)} · ${selected.at}`});const radius=typeof selected.accuracyM==='number'&&Number.isFinite(selected.accuracyM)&&selected.accuracyM>=0?new google.maps.Circle({map:map.current,center:selected.position,radius:selected.accuracyM,strokeColor:selected.disposition==='applied'?'#ac3716':'#a06b10',strokeOpacity:.8,fillColor:'#d89b28',fillOpacity:.18}):null;map.current.panTo(selected.position);return()=>{marker.setMap(null);radius?.setMap(null);};},[ready,selected]);
  return <div className="tracking-map">{!key?<p className="map-unavailable">Map is not connected. Recorded coordinates and measurements remain available in the sample history.</p>:<><div ref={ref} className="map-canvas" aria-label="Google map of recorded applied telemetry samples"/>{!ready&&!error&&<p role="status" className="fine">Loading breadcrumb map…</p>}{error&&<p role="alert" className="error">{error}</p>}{!trails.length&&<p className="notice">No applied coordinates in the loaded history. No breadcrumb line is drawn.</p>}</>}</div>;
}

function FeedStatus({page,historical}:{page:TrackingPage|undefined;historical:boolean}){
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{const start=page?.clientReceivedAt??performance.now();setElapsed(Math.max(0,performance.now()-start));const timer=setInterval(()=>setElapsed(performance.now()-start),1000);return()=>clearInterval(timer);},[page?.clientReceivedAt,page?.serverTime]);
 const freshness=feedFreshness(page?.latestReceivedAt,page?.serverTime,elapsed);
 const label=historical?'Historical telemetry':freshness.status==='receiving'?'Receiving telemetry':freshness.status==='quiet'?'Feed quiet':freshness.status==='missing'?'No telemetry':'Freshness unavailable';
 return <p className={freshness.status==='quiet'&&!historical?'notice':'fine'}><strong>{label}</strong>{freshness.ageSeconds!==null?` · Last observation received ${freshness.ageSeconds} seconds ago.`:'.'} {!historical&&freshness.status==='quiet'?'The source may be paused or disconnected. ':''}Receipt activity is separate from GPS accuracy and sample time. Quiet means no new receipt for 30 seconds of real time; pausing the scenario clock does not pause this indicator.</p>;
}
