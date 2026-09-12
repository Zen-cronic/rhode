export type BillingSource={id:string;version:number;sha256:string;media_type:string;filename?:string};
export type BillingInvoice={id:string;revision:number;status:string;contract_version:number;body:any};
export type BillingReview={visit:{id:string;assignment_id:string;load_id:string;stop_id:string;arrival:string;departure:string|null;arrival_event:string;departure_event:string|null;superseded_by?:string|null};reviewRequired:boolean;fingerprint:string;documents:BillingSource[];history:{id:string;revision:number;body:any}[];invoices:BillingInvoice[];neighbors:any[];terms:any[];effective:{arrivalAt:string;departureAt:string}};
export function billingDecision(data:BillingReview){
 const invoice=[...data.invoices].sort((a,b)=>b.revision-a.revision)[0],correction=[...data.history].sort((a,b)=>b.revision-a.revision)[0];
 const source:BillingSource|undefined=correction?.body.document;
 const currentSource=source&&data.documents.find(d=>d.id===source.id);
 const reasons:string[]=[];
 if(!invoice||invoice.status!=='draft')reasons.push('No current draft requires approval.');
 if(!data.visit.departure||data.visit.superseded_by)reasons.push('A closed current visit is required.');
 if(data.reviewRequired)reasons.push('Late GPS evidence needs dispatcher reconciliation.');
 if((invoice?.body.timingEvidence?.correctionId??null)!==(correction?.id??null))reasons.push('Billing times changed. Prepare a current draft on web.');
 if(source&&(!currentSource||currentSource.version!==source.version||currentSource.sha256!==source.sha256))reasons.push('The supporting document changed. Review current times on web.');
 if(invoice&&JSON.stringify(invoice.body.evidence)!==JSON.stringify([data.visit.arrival_event,data.visit.departure_event]))reasons.push('The observed visit evidence changed.');
 if(invoice&&!data.terms.some(t=>t.id===invoice.body.contract?.id&&t.version===invoice.contract_version))reasons.push('The shipment contract changed. Prepare a current draft on web.');
 // The API rechecks all neighbor intervals and contracts atomically on approval.
 if(invoice?.body.timingConflicts?.length)reasons.push('This draft flags overlapping visits. Resolve and prepare a current draft on web.');
 return {invoice,correction,source,reasons,canApprove:reasons.length===0};
}
export function sourceKey(source:BillingSource){return `${source.id}:${source.version}:${source.sha256}`;}
export function billingApproval(data:BillingReview,note:string,acknowledged:boolean,openedSource:string){
 const decision=billingDecision(data);
 if(!decision.canApprove||!acknowledged||note.trim().length<20||decision.source&&openedSource!==sourceKey(decision.source))return null;
 return {invoiceId:decision.invoice!.id,acknowledgeObservedSamples:true,...(decision.correction?{acknowledgeCorrectedTimes:true}:{}),evidenceNote:note.trim()};
}
