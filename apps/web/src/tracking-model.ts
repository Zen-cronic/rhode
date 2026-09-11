export type TrackingPoint = {
  id: string;
  at: string;
  recordedAt: string;
  position: { lat: number; lng: number };
  accuracyM: number | null;
  speedKph: number | null;
  odometerKm: number | null;
  duty: string;
  provenance: string;
  disposition: string;
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
function usable(point:TrackingPoint):boolean {
  return point.disposition==='applied'&&validPosition(point)&&Number.isFinite(Date.parse(point.at))&&typeof point.accuracyM==='number'&&Number.isFinite(point.accuracyM)&&point.accuracyM>=0&&point.accuracyM<=100;
}
function continuous(a:TrackingPoint,b:TrackingPoint):boolean {
  const ms=Date.parse(b.at)-Date.parse(a.at);
  const minimumKm=Math.max(0,chordKm(a,b)-((a.accuracyM??0)+(b.accuracyM??0))/1000);
  return ms>0&&ms<=MAX_TRACKING_GAP_MS&&a.provenance===b.provenance&&minimumKm/(ms/3600000)<=MAX_IMPLIED_KPH;
}
export function appliedTrails(points: TrackingPoint[]): TrackingPoint[][] {
  const trails:TrackingPoint[][]=[];let current:TrackingPoint[]=[];
  const close=()=>{if(current.length)trails.push(current);current=[];};
  for(const point of points){
    if(!usable(point)){close();continue;}
    if(current.length&&!continuous(current[current.length-1],point))close();
    current.push(point);
  }
  close();return trails;
}
export function trackingDistance(points:TrackingPoint[]) {
  const trails=appliedTrails(points);let odometerKm=0,gpsChordKm=0,odometerIntervals=0,gpsIntervals=0,missingOdometerIntervals=0;
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
export function sampleNumber(value: number | null | undefined, unit: string): string {
  return typeof value==='number'&&Number.isFinite(value)?`${new Intl.NumberFormat('en-CA',{maximumFractionDigits:2}).format(value)} ${unit}`:'Unknown';
}
export function dispositionLabel(value:string):string{
  if(value==='applied')return 'Applied';
  if(value==='uncertain')return 'Uncertain GPS';
  if(value==='retained_out_of_order')return 'Retained out of order';
  return value.replaceAll('_',' ');
}

export function feedFreshness(receivedAt:string|null|undefined,serverTime:string|undefined,elapsedMs:number){
 if(!receivedAt)return {status:'missing',ageSeconds:null} as const;
 const received=Date.parse(receivedAt),server=Date.parse(serverTime??'');
 if(!Number.isFinite(received)||!Number.isFinite(server)||!Number.isFinite(elapsedMs)||elapsedMs<0)return {status:'unknown',ageSeconds:null} as const;
 const ageSeconds=Math.floor(Math.max(0,server-received+elapsedMs)/1000);
 return {status:ageSeconds>=30?'quiet':'receiving',ageSeconds} as const;
}
