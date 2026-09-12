import { validateCommand } from "@roadstar/domain/commands";
import { ApiError, authHeaders, jsonResponse } from "@roadstar/client";
export { ApiError };
import type {
  Assignment,
  Driver,
  Load,
  Screening,
  Truck,
  Trailer,
} from "@roadstar/domain";
export type Resource = (Driver | Truck | Trailer) & {
  kind: "driver" | "truck" | "trailer";
  version: number;
  name?: string;
  hosEvidence?: import("@roadstar/domain/hos-profile").HosProfileResult["hosEvidence"] & {revision?:number;sourceRef?:string;reviewedBy?:string};
  duty?: string;
  position?: { lat: number; lng: number };
  equipment?: string;
  capacityLb?: number;
  budget?: Driver["budget"];
};
export type Proposal = {
  id: string;
  load_id: string;
  expected_version: number;
  revision: number;
  status: string;
  body: {
    driverId: string;
    truckId: string;
    trailerId: string;
    currentAssignmentId?: string;
    reason: string;
    proof: Screening;
    comparison?:{current?:Screening;currentUnavailable?:string;proposed:Screening;evaluatedAt?:string};
    assumptions: string[];
  };
};
export type Visit = {
  session_policy?: string;
  assignment_id?: string;
  id: string;
  load_id: string;
  stop_id: string;
  arrival: string;
  departure: string | null;
  arrival_event: string;
  departure_event: string | null;
};
export type Invoice = {
  id: string;
  visit_id: string;
  contract_id?: string;
  contract_version?: number;
  revision: number;
  status: string;
  body: {
    timingConflicts?: {visitId:string;stopId:string;arrivalAt:string;departureAt:string|null}[];
    timingConflictReview?: {remainingConflicts:unknown[];checkedAt:string};
    timingEvidence?: {correctionId:string;revision:number;arrivalAt:string;departureAt:string;sourceNote:string;reason:string;reviewedBy:string;recordedAt:string;document:{id:string;version:number;sha256:string;filename:string}};
    visitPolicy?: {id:string;boundaryRule:string;reentryRule:string;freeTimeScope:string};
    dwellMinutes: number;
    billableMinutes: number;
    amountCents: number;
    currency: string;
    evidence: string[];
    precision: string;
    requiresEvidenceReview: boolean;
    contract?: {
      id: string;
      version: number;
      free_minutes: number;
      rate_cents_per_hour: number;
      currency: string;
    };
    review?: {
      reviewedBy: string;
      recordedAt: string;
      note: string;
      previousRevisionId: string;
    };
  };
};
export type DocumentFields = {
  billNumber: string | null;
  signedBy: string | null;
  observedDate: string | null;
  notes: string | null;
};
export type ShipmentDocument = {
  id: string;
  load_id: string;
  media_type: string;
  status: string;
  version: number;
  sha256: string | null;
  extraction: {
    kind: string;
    filename: string;
    model?: string;
    fields?: DocumentFields;
    reviewedFields?: DocumentFields;
    reviewStatus?: string;
    reviewedBy?: string;
    reviewReason?: string;
  };
};
export type FacilityNote = {
  id: string;
  load_id: string;
  stop_id: string;
  document_id: string;
  document_version: number;
  instructions: string;
  reviewed_by: string;
};
export type MaintenanceHold = {
  id: string;
  resource_id: string;
  period: string;
  reason: string;
  resolved_at: string | null;
};
export type PlanningVehicle = { driverId: string; truckId: string; trailerId: string };
export type PlanningRun = {
  id: string; version: number; status: string; recorded_at?: string;
  input: { now: string; vehicles: (PlanningVehicle & { id: string; available_at?: number })[]; versions: {id:string;kind:string;version:number}[] };
  result: { routes: {vehicle_id:string; stops:{load_id:string;stop:"pickup"|"delivery";minute:number}[]; driving_minutes:number; duty_minutes:number}[]; infeasible_loads:{load_id?:string;vehicle_id?:string;reason:string}[]; input_hash?:string; routing_evidence?:string; assumptions?:string[] };
};
export type TripGroupStop = {assignmentId:string;loadId:string;stop:"pickup"|"delivery";stopId:string;point:{id:string;name:string;lat:number;lng:number};minute:number};
export type TripGroup = {id:string;driver_id:string;status:string;version:number;body:PlanningVehicle & {stops:TripGroupStop[];startAt:string;endAt:string;drivingMinutes:number;dutyMinutes:number;assumptions:string[];routingEvidence:string;inputHash:string;provenance:string}};
export type StopCompletion = {assignment_id:string;stop_id:string};

export type SendCommand = (
  path: string,
  body: Record<string, unknown>,
  version: number,
) => Promise<boolean | undefined>;
export type State = {
  actor: {
    role: "driver" | "dispatcher";
    driverId?: string;
    carrierId: string;
  };
  disruptions: {
    id: string;
    assignment_id: string;
    expected_end: string;
    observed_at: string;
    reason: string;
    provenance: string;
  }[];
  serverTime: string;
  cursor: string;
  scenarios: { id: string; clock: string }[];
  loads: Load[];
  assignments: Assignment[];
  resources: Resource[];
  proposals: Proposal[];
  visits: Visit[];
  openVisitEstimates?: import('../../../packages/domain/src/open-visit').OpenVisitEstimate[];
  invoices: Invoice[];
  documents?: ShipmentDocument[];
  facilityNotes?: FacilityNote[];
  maintenanceHolds?: MaintenanceHold[];
  planningRuns?: PlanningRun[];
  tripGroups?: TripGroup[];
  stopCompletions?: StopCompletion[];
  workSessions?: import("@roadstar/domain/tracking").MileageSession[];
};
export type Session = {
  carrier: string;
  token: string;
  label: string;
  uid: string;
};
export type Command = {
  id: string;
  path: string;
  body: Record<string, unknown>;
  version: number;
  status: "pending" | "failed" | "synchronized";
  message?: string;
  retryable?: boolean;
  createdAt: string;
};
export const apiUrl = import.meta.env.VITE_API_URL || "";
export async function request<T>(
  session: Session,
  path: string,
  command?: Command,
): Promise<T> {
  const res = await fetch(`${apiUrl}/api/${path}`, {
    method: command ? "POST" : "GET",
    headers: {
      ...authHeaders(
        { token: session.token, carrierId: session.carrier },
        command
          ? { key: command.id, expectedVersion: command.version }
          : undefined,
      ),
      ...(command ? { "Content-Type": "application/json" } : {}),
    },
    body: command
      ? JSON.stringify(validateCommand(path, command.body))
      : undefined,
  });
  return jsonResponse<T>(res);
}
