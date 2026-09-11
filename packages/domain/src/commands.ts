import {z} from 'zod';
const id=z.string().min(1).max(128),uuid=z.string().uuid();
const assignmentInput=z.object({loadId:id,driverId:id,truckId:id,trailerId:id});
export const schemas={
  'bind-contract':z.object({loadId:id,contractId:id}),
  'approve-plan':z.object({planId:uuid}),
  optimize:z.object({loadIds:z.array(id).min(1).max(20),vehicles:z.array(z.object({driverId:id,truckId:id,trailerId:id})).min(1).max(8)}),
  'review-document':z.object({documentId:uuid,fields:z.object({billNumber:z.string().nullable(),signedBy:z.string().nullable(),observedDate:z.string().nullable(),notes:z.string().nullable()}).strict(),reason:z.string().min(10).max(2000)}),
  'approve-invoice':z.object({invoiceId:uuid,acknowledgeObservedSamples:z.literal(true),evidenceNote:z.string().min(20).max(2000)}),
  'facility-note':z.object({documentId:uuid,stopId:id,instructions:z.string().min(10).max(4000)}),
  maintenance:z.discriminatedUnion('action',[z.object({action:z.literal('hold'),resourceId:id,startAt:z.string(),endAt:z.string(),reason:z.string().min(5).max(2000)}),z.object({action:z.literal('release'),resourceId:id,holdId:uuid})]),
  'push-token':z.object({token:z.string().min(10).max(4096),platform:z.enum(['android','ios']),enabled:z.boolean().optional()}),
  document:z.object({loadId:id,mediaType:z.enum(['image/jpeg','image/png','application/pdf']),kind:z.enum(['pod','manifest','other']),filename:z.string().min(1).max(255)}),
  delay:z.object({assignmentId:uuid,expectedEnd:z.string(),observedAt:z.string(),reason:z.string().min(1).max(2000)}),
  duty:z.object({duty:z.enum(['off_duty','on_duty','driving','sleeper']),at:z.string(),note:z.string().max(2000).optional()}),
  'complete-stop':z.object({assignmentId:uuid,stopId:id,occurredAt:z.string().datetime({offset:true}).optional(),note:z.string().max(2000).optional()}),
  dispatch:assignmentInput,
  propose:assignmentInput.extend({reason:z.string().max(2000).optional()}),
  approve:z.object({proposalId:uuid}),
  respond:z.object({assignmentId:uuid,action:z.enum(['accept','reject'])}),
  'work-session':z.discriminatedUnion('action',[z.object({action:z.literal('start')}),z.object({action:z.literal('end'),sessionId:uuid})]),
  telemetry:z.object({id,assignmentId:uuid,sessionId:uuid.optional(),at:z.string(),position:z.object({lat:z.number(),lng:z.number()}),accuracyM:z.number().nonnegative(),speedKph:z.number().nullable(),odometerKm:z.number().nullable(),duty:z.enum(['off_duty','on_duty','driving','sleeper']),provenance:z.enum(['synthetic','live','imported-historical'])}),
  detention:z.object({visitId:uuid,contractId:id})
};

export function validateCommand(path:string,body:unknown){const name=path.replace(/^\/api\//,'');const schema=schemas[name as keyof typeof schemas];return schema?schema.parse(body):body;}
