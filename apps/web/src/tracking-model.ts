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
export type TrackingPage = {assignmentId:string;points:TrackingPoint[];nextBefore?:string|null};
export function validPosition(point: TrackingPoint): boolean {
  return !!point.position && Number.isFinite(point.position.lat) && Number.isFinite(point.position.lng) && Math.abs(point.position.lat)<=90 && Math.abs(point.position.lng)<=180;
}
export function mergeSamples(pages: TrackingPage[]): TrackingPoint[] {
  const unique = new Map<string,TrackingPoint>();
  for(const page of pages) for(const point of page.points) if(!unique.has(point.id))unique.set(point.id,point);
  return [...unique.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
}
export function appliedTrails(points: TrackingPoint[]): TrackingPoint[][] {
  const trails: TrackingPoint[][]=[];
  let current:TrackingPoint[]=[];
  for(const point of points){
    if(point.disposition==='applied'&&validPosition(point))current.push(point);
    else if(current.length){trails.push(current);current=[];}
  }
  if(current.length)trails.push(current);
  return trails;
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
