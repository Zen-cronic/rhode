import {z} from 'zod';
import {DomainError} from './index.ts';
import type {HosProfile} from './hos-profile.ts';
export const hosReviewSchema=z.object({driverId:z.string().min(1).max(128),cycle:z.union([z.literal(1),z.literal(2)]),dayAnchor:z.string().datetime({offset:true}),cycleStartedAt:z.string().datetime({offset:true}).optional(),sourceName:z.string().min(1).max(255),sourceCsv:z.string().min(1).max(700000),reason:z.string().min(10).max(2000),acknowledgePlanningLimits:z.literal(true),acceptIncomplete:z.boolean().default(false)}).strict();
export type HosReviewInput=z.infer<typeof hosReviewSchema>;
/** Small RFC4180-style reader: three explicit columns; no implicit date/unit conversion. */
export function parseDutyCsv(csv:string,sourceName:string):HosProfile['history']{
 const invalid=(message:string):never=>{throw new DomainError('INVALID_HISTORY',message,400);};
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 const finishCell=()=>{row.push(cell);cell='';closed=false;};const finishRow=()=>{finishCell();if(row.some(c=>c.trim()))rows.push(row);row=[];};
 for(let i=0;i<csv.length;i++){const c=csv[i];if(quoted){if(c==='"'){if(csv[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)invalid('Unexpected quote in duty CSV.');quoted=true;}else if(c===',')finishCell();else if(c==='\n'||c==='\r'){if(c==='\r'&&csv[i+1]==='\n')i++;finishRow();}else {if(closed)invalid('Unexpected characters after a quoted CSV field.');cell+=c;}}
 if(quoted)invalid('Unclosed CSV quote.');if(cell||row.length||closed)finishRow();
 if(rows.length<2||rows.length>5001)invalid('Provide a header and 1–5,000 duty intervals.');
 if(rows[0].map(c=>c.trim().replace(/^\uFEFF/,'').toLowerCase()).join(',')!=='start,end,duty')invalid('Duty CSV requires exactly: start,end,duty.');
 const time=z.string().datetime({offset:true});
 return rows.slice(1).map((r,index)=>{if(r.length!==3)invalid(`Row ${index+2}: expected start, end and duty.`);const [start,end,duty]=r.map(c=>c.trim());if(!time.safeParse(start).success||!time.safeParse(end).success)invalid(`Row ${index+2}: use ISO timestamps with a timezone.`);if(!['off_duty','sleeper','on_duty','driving'].includes(duty))invalid(`Row ${index+2}: unsupported duty status.`);if(Date.parse(end)<=Date.parse(start))invalid(`Row ${index+2}: end must follow start.`);return {start,end,duty:duty as HosProfile['history'][number]['duty'],source:`${sourceName}:row-${index+2}`};});
}
export function importedHosProfile(input:HosReviewInput):HosProfile{return {ruleset:'federal-south-60-solo-ordinary-v1',cycle:input.cycle,dayAnchor:input.dayAnchor,timeZone:'America/Toronto',exceptions:[],...(input.cycleStartedAt?{cycleStartedAt:input.cycleStartedAt}:{}),history:parseDutyCsv(input.sourceCsv,input.sourceName)};}
