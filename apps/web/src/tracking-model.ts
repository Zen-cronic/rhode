export {validPosition,mergeSamples,MAX_TRACKING_GAP_MS,MAX_IMPLIED_KPH,appliedTrails,trackingDistance} from '@roadstar/domain/tracking';
export type {TrackingPoint,TrackingPage} from '@roadstar/domain/tracking';
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
