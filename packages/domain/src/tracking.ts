export type TrackingPoint = {
  id: string;
  sessionId?: string | null;
  at: string;
  recordedAt: string;
  position: { lat: number; lng: number };
  accuracyM: number | null;
  speedKph: number | null;
  odometerKm: number | null;
  duty: string;
  provenance: string;
  disposition: string;
  timestampConflict?: boolean;
  geofenceEvidence?: {status: "ambiguous" | "evaluated"; policy: string; stopIds: string[]; reason: string; sessionPolicy?: string; stopStates?: {stopId:string;confidence:"inside"|"outside"|"boundary"|"uncertain";distanceM:number;radiusM:number}[]} | null;
};
export type TrackingPage = {assignmentId:string;serverTime?:string;clientReceivedAt?:number;latestReceivedAt?:string|null;points:TrackingPoint[];nextBefore?:string|null};
export function validPosition(point: TrackingPoint): boolean {
  return !!point.position && Number.isFinite(point.position.lat) && Number.isFinite(point.position.lng) && Math.abs(point.position.lat)<=90 && Math.abs(point.position.lng)<=180;
}
export function mergeSamples(pages: TrackingPage[]): TrackingPoint[] {
  const unique = new Map<string,TrackingPoint>();
  for(const page of pages) for(const point of page.points) if(!unique.has(point.id))unique.set(point.id,point);
  return [...unique.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
}
// Display continuity assumptions, not legal speed limits or navigation guarantees.
export const MAX_TRACKING_GAP_MS = 120_000;
export const MAX_IMPLIED_KPH = 160;
function chordKm(a:TrackingPoint,b:TrackingPoint):number {
  const rad=Math.PI/180,dLat=(b.position.lat-a.position.lat)*rad,dLng=(b.position.lng-a.position.lng)*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a.position.lat*rad)*Math.cos(b.position.lat*rad)*Math.sin(dLng/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export type TrackingEvidenceMode='applied'|'retrospective';
function usable(point:TrackingPoint,mode:TrackingEvidenceMode):boolean {
  return !point.timestampConflict&&(point.disposition==='applied'||(mode==='retrospective'&&point.disposition==='retained_out_of_order'))&&validPosition(point)&&Number.isFinite(Date.parse(point.at))&&typeof point.accuracyM==='number'&&Number.isFinite(point.accuracyM)&&point.accuracyM>=0&&point.accuracyM<=100;
}
function continuous(a:TrackingPoint,b:TrackingPoint):boolean {
  const ms=Date.parse(b.at)-Date.parse(a.at);
  const minimumKm=Math.max(0,chordKm(a,b)-((a.accuracyM??0)+(b.accuracyM??0))/1000);
  return ms>0&&ms<=MAX_TRACKING_GAP_MS&&a.provenance===b.provenance&&(a.sessionId??null)===(b.sessionId??null)&&minimumKm/(ms/3600000)<=MAX_IMPLIED_KPH;
}
export function appliedTrails(points: TrackingPoint[],mode:TrackingEvidenceMode='applied'): TrackingPoint[][] {
  const trails:TrackingPoint[][]=[];let current:TrackingPoint[]=[];
  const close=()=>{if(current.length)trails.push(current);current=[];};
  for(const point of points){
    if(!usable(point,mode)){close();continue;}
    if(current.length&&!continuous(current[current.length-1],point))close();
    current.push(point);
  }
  close();return trails;
}
export function trackingDistance(points:TrackingPoint[],mode:TrackingEvidenceMode='applied') {
  const trails=appliedTrails(points,mode);let odometerKm=0,gpsChordKm=0,odometerIntervals=0,gpsIntervals=0,missingOdometerIntervals=0;
  for(const trail of trails)for(let i=1;i<trail.length;i++){
    const a=trail[i-1],b=trail[i],hours=(Date.parse(b.at)-Date.parse(a.at))/3600000;
    const start=a.odometerKm,end=b.odometerKm;
    const delta=typeof start==='number'&&typeof end==='number'?end-start:NaN;
    if(typeof start==='number'&&typeof end==='number'&&Number.isFinite(delta)&&start>=0&&end>=0&&delta>=0&&delta/hours<=MAX_IMPLIED_KPH){odometerKm+=delta;odometerIntervals++;}
    else missingOdometerIntervals++;
    const chord=chordKm(a,b);
    // Avoid counting stationary jitter inside the samples' combined uncertainty.
    if(chord>((a.accuracyM??0)+(b.accuracyM??0))/1000){gpsChordKm+=chord;gpsIntervals++;}
  }
  const linkedIntervals=trails.reduce((n,t)=>n+Math.max(0,t.length-1),0);
  return {odometerKm:odometerIntervals?odometerKm:null,gpsChordKm:linkedIntervals?gpsChordKm:null,gpsIntervals,odometerIntervals,missingOdometerIntervals,segments:trails.length,linkedIntervals};
}

export type MileageLeg={assignmentId:string;truckId:string;loadId:string;samples:number;firstAt:string|null;lastAt:string|null;odometerKm:number|null;gpsChordKm:number|null;linkedIntervals:number;odometerIntervals:number;missingOdometerIntervals:number;unlinkedIntervals:number;observedSeconds:number;provenance:string[]};
export type MileageReport={evidencePolicy?:'occurrence-ordered-v2';lateSamples?:number;timestampConflictSamples?:number;scope:'assignment'|'work-session';id:string;driverId:string;asOf:string;startedAt:string|null;endedAt:string|null;allRetainedSamples:boolean;samples:number;odometerKm:number|null;gpsChordKm:number|null;legs:MileageLeg[];assumptions:string[]};
export type MileageSession={id:string;driver_id?:string;started_at?:string;ended_at:string|null};
export function mileagePath(selection:string){const [kind,id]=selection.split(':');if(!['assignment','session'].includes(kind)||!id)throw new Error('Choose a trip or work session.');return `mileage?${kind==='session'?'sessionId':'assignmentId'}=${encodeURIComponent(id)}`;}
export function mileageMatches(report:MileageReport,selection:string){return report?.id===selection.split(':')[1]&&report.scope===(selection.startsWith('session:')?'work-session':'assignment')&&Array.isArray(report.legs);}
