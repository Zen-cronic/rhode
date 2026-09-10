import type {Load, Driver, Truck, Trailer} from '../../../packages/domain/src/index.ts';

export const DEMO_NOW = '2026-09-13T12:00:00.000Z';
export const milton = {id:'milton-yard',name:'Milton terminal · demo location',lat:43.5183,lng:-79.8774,radiusM:200};
export const london = {id:'london-dock',name:'London distribution dock · demo location',lat:42.987,lng:-81.176,radiusM:180};
export function fixtures() {
  const loads: Load[] = [
    {id:'RS-1042',customer:'Demo customer · regional grocery',pickup:milton,delivery:london,equipment:'Dry Van',weightLb:32000,pallets:20,mode:'FTL',startAt:'2026-09-13T12:30:00Z',endAt:'2026-09-13T16:00:00Z',drivingMinutes:105,serviceMinutes:60,status:'open',version:1,provenance:'synthetic'},
    {id:'RS-1043',customer:'Demo customer · packaging',pickup:london,delivery:milton,equipment:'Dry Van',weightLb:18000,pallets:12,mode:'FTL',startAt:'2026-09-13T16:15:00Z',endAt:'2026-09-13T19:00:00Z',drivingMinutes:105,serviceMinutes:45,status:'open',version:1,provenance:'synthetic'},
    {id:'RS-1044',customer:'Demo customer · cold chain',pickup:milton,delivery:{id:'barrie-dock',name:'Barrie receiving · demo location',lat:44.351,lng:-79.69,radiusM:180},equipment:'Reefer',weightLb:28000,pallets:18,mode:'FTL',startAt:'2026-09-13T12:45:00Z',endAt:'2026-09-13T16:30:00Z',drivingMinutes:120,serviceMinutes:60,status:'open',version:1,provenance:'synthetic'}
  ];
  const drivers: Driver[] = [
    {id:'D-01',name:'Alex Chen · demo',duty:'on_duty',position:milton,budget:{drivingMinutes:420,onDutyMinutes:480,shiftMinutes:540,cycleMinutes:900},budgetAsOf:DEMO_NOW,provenance:'synthetic'},
    {id:'D-02',name:'Morgan Singh · demo',duty:'on_duty',position:milton,budget:{drivingMinutes:360,onDutyMinutes:420,shiftMinutes:720,cycleMinutes:750},budgetAsOf:DEMO_NOW,provenance:'synthetic'},
    {id:'D-03',name:'Taylor Roy · demo',duty:'off_duty',position:london,budget:null,budgetAsOf:null,provenance:'synthetic'}
  ];
  const profile:NonNullable<Truck['routingProfile']>={height:4.1,width:2.6,length:23,weight:40,axle_load:9,hazmat:false,evidence:'synthetic-scenario'};
  const trucks: Truck[] = [{id:'T-101',axleClearance:'verified',provenance:'synthetic',routingProfile:profile},{id:'T-102',axleClearance:'verified',provenance:'synthetic',routingProfile:profile},{id:'T-103',axleClearance:'unknown',provenance:'synthetic'}];
  const trailers: Trailer[] = [{id:'V-101',equipment:'Dry Van',capacityLb:44500,provenance:'synthetic'},{id:'V-102',equipment:'Dry Van',capacityLb:44500,provenance:'synthetic'},{id:'R-101',equipment:'Reefer',capacityLb:43500,provenance:'synthetic'}];
  return {loads,drivers,trucks,trailers};
}
