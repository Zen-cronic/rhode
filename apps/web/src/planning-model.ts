import type { PlanningVehicle, StopCompletion, TripGroup, TripGroupStop } from "./api";
export function pairingError(vehicles: PlanningVehicle[]): string | null {
  if (!vehicles.length || vehicles.length > 8) return "Choose between one and eight vehicle pairings.";
  for (const field of ["driverId", "truckId", "trailerId"] as const) {
    if (vehicles.some((vehicle) => !vehicle[field])) return "Choose a driver, truck and trailer for every pairing.";
    if (new Set(vehicles.map((vehicle) => vehicle[field])).size !== vehicles.length) return "A driver, truck or trailer can appear in only one pairing.";
  }
  return null;
}
export function stopCompleted(stop: TripGroupStop, completions: StopCompletion[]): boolean {
  return completions.some((completed) => completed.assignment_id === stop.assignmentId && completed.stop_id === stop.stopId);
}
export function nextGroupStop(group: TripGroup, completions: StopCompletion[]): TripGroupStop | undefined {
  return group.body.stops.find((stop) => !stopCompleted(stop, completions));
}
export function plannedTime(now: string, minute: number): string {
  const timestamp = Date.parse(now) + minute * 60_000;
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}).format(timestamp);
}
