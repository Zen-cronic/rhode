export type Provenance = 'synthetic' | 'imported-historical' | 'live';
export type Point = {lat: number; lng: number};
export type Stop = Point & {id: string; name: string; radiusM: number};
export type Equipment = 'Dry Van' | 'Reefer' | 'Flatbed';
export type Load = {
  id: string; customer: string; pickup: Stop; delivery: Stop; equipment: Equipment;
  weightLb: number | null; pallets: number; mode: 'FTL' | 'LTL';
  startAt: string; endAt: string; drivingMinutes: number; serviceMinutes: number;
  status: 'open' | 'offered' | 'accepted' | 'in_transit' | 'completed';
  version: number; provenance: Provenance; sourceRef?: string;
};
export type Driver = {
  id: string; name: string; duty: 'off_duty' | 'on_duty' | 'driving' | 'sleeper';
  position: Point; budget: {drivingMinutes: number; onDutyMinutes: number; shiftMinutes: number; cycleMinutes: number} | null;
  budgetAsOf: string | null; provenance: Provenance;
};
export type Truck = {id: string; axleClearance: 'verified' | 'unknown'; provenance: Provenance; routingProfile?: {height:number;width:number;length:number;weight:number;axle_load:number;hazmat:boolean;evidence:'operator-verified'|'synthetic-scenario'}};
export type Trailer = {id: string; equipment: Equipment; capacityLb: number; provenance: Provenance};
export type Assignment = {
  id: string; loadId: string; driverId: string; truckId: string; trailerId: string;
  startAt: string; endAt: string; status: 'offered' | 'accepted' | 'rejected' | 'completed' | 'superseded'; version: number;
};
export type Telemetry = {
  id: string; assignmentId: string; at: string; position: Point; speedKph: number | null;
  odometerKm: number | null; duty: Driver['duty']; provenance: Provenance;
};
export class DomainError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status = 409) {
    super(message); this.code = code; this.status = status;
  }
}
export function demand(condition: unknown, code: string, message: string, status = 409): asserts condition {
  if (!condition) throw new DomainError(code, message, status);
}
export function timestamp(value: string): number {
  demand(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), 'INVALID_TIME', 'Use an ISO timestamp with a timezone.', 400);
  return Date.parse(value);
}
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat-a.lat)*rad, dLng = (b.lng-a.lng)*rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0,1-h)));
}
export function overlaps(a: {startAt: string; endAt: string}, b: {startAt: string; endAt: string}) {
  return timestamp(a.startAt) < timestamp(b.endAt) && timestamp(b.startAt) < timestamp(a.endAt);
}
export type ScreeningTiming={evaluatedAt:string;availableAt:string;pickupArrivalAt:string;pickupReadyAt:string;pickupLateMinutes:number;completionAt:string;travelMinutes:number;serviceMinutes:number};
export type Screening = {timing?:ScreeningTiming;eligible: boolean; reasons: string[]; deadheadKm: number; note: string;routeFingerprint?:string;routingEvidence?:string};
export function screen(load: Load, driver: Driver, truck: Truck, trailer: Trailer, assignments: Assignment[], now: string, road?:{drivingMinutes:number;deadheadMinutes:number;deadheadKm:number}): Screening {
  const reasons: string[] = [];
  if (load.status !== 'open') reasons.push('Load is already dispatched.');
  if (timestamp(load.endAt) <= timestamp(load.startAt)) reasons.push('Invalid appointment window.');
  if (timestamp(load.startAt) < timestamp(now)) reasons.push('Pickup window has already started.');
  if (load.weightLb === null || !Number.isFinite(load.weightLb) || load.weightLb <= 0) reasons.push('Load weight is unverified.');
  else if (load.weightLb > trailer.capacityLb) reasons.push('Trailer payload capacity exceeded.');
  if (load.equipment !== trailer.equipment) reasons.push('Trailer equipment does not match.');
  if (truck.axleClearance !== 'verified') reasons.push('Truck and axle clearance is unverified.');
  const deadheadKm = road?.deadheadKm ?? distanceKm(driver.position, load.pickup);
  // A conservative planning estimate, not road travel-time proof. Routing packet replaces this input.
  const deadheadMinutes=road?.deadheadMinutes??Math.ceil(deadheadKm / 50 * 60);
  const driveMinutes = (road?.drivingMinutes??load.drivingMinutes) + deadheadMinutes;
  const workMinutes = driveMinutes + load.serviceMinutes;
  if (!driver.budget || !driver.budgetAsOf || timestamp(now)-timestamp(driver.budgetAsOf) > 15*60_000 || timestamp(driver.budgetAsOf) > timestamp(now)) {
    reasons.push('Current HOS evidence is missing or stale.');
  } else {
    if (driveMinutes > driver.budget.drivingMinutes) reasons.push('Insufficient driving budget.');
    if (workMinutes > driver.budget.onDutyMinutes) reasons.push('Insufficient on-duty budget.');
    if (workMinutes > driver.budget.cycleMinutes) reasons.push('Insufficient cycle budget.');
    const waitMinutes = Math.max(0, (timestamp(load.startAt)-timestamp(now))/60_000-deadheadMinutes);
    if (waitMinutes+workMinutes > driver.budget.shiftMinutes) reasons.push('Elapsed shift window would be exceeded.');
  }
  const conflict = assignments.find(a => a.status !== 'rejected' && a.status !== 'completed' && a.status !== 'superseded' && overlaps(a,load) &&
    (a.driverId===driver.id || a.truckId===truck.id || a.trailerId===trailer.id));
  if (conflict) reasons.push(`Resource reserved by ${conflict.loadId}.`);
  return {eligible: reasons.length===0, reasons, deadheadKm: Math.round(deadheadKm*10)/10,
    note: road ? 'Truck-route travel times with declared work budgets. OSM restrictions and supplied dimensions require review; not certified ELD or legal clearance.' : 'Planning screen using declared budgets; not full HOS/ELD or axle certification. Deadhead is an estimated straight-line planning allowance until road routing is connected.'};
}
export function detention(arrival: string, departure: string, mode: Load['mode'], rateCentsPerHour: number | null) {
  const elapsed = timestamp(departure)-timestamp(arrival);
  demand(elapsed>=0,'INVALID_STOP_TIME','Departure precedes arrival.',400);
  demand(rateCentsPerHour===null || Number.isSafeInteger(rateCentsPerHour) && rateCentsPerHour>=0,'INVALID_RATE','Rate must be nonnegative integer cents.',400);
  const dwellMinutes = Math.floor(elapsed/60_000);
  const billableMinutes = mode==='FTL' ? Math.max(0,dwellMinutes-120) : 0;
  return {dwellMinutes,billableMinutes,amountCents: rateCentsPerHour===null ? null : Math.round(billableMinutes*rateCentsPerHour/60),
    status: mode==='LTL' ? 'contract_required' : rateCentsPerHour===null ? 'rate_required' : 'draft' };
}
