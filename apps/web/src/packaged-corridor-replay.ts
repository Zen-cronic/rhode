import {mergeCorridorPage,type CorridorPage,type CorridorRecording} from './corridor-replay-model.ts';

type ReplayIdentity={run_id:string;assignment_id:string;event_count:number;conditions_hash:string};
type PackagedRun={role:'baseline'|'road_slowdown';run:ReplayIdentity;pages:CorridorPage[]};
type PackagedArchive={schema:1;title:string;provenance:'synthetic';comparison_basis_hash:string;runs:PackagedRun[];limits:string};
type Progress={loaded:number;total:number|null};

const cache=new Map<string,Promise<PackagedArchive>>();

async function fetchArchive(url:string){
 let pending=cache.get(url);if(!pending){pending=fetch(url,{headers:{accept:'application/json'}}).then(async response=>{if(!response.ok)throw new Error(`Packaged replay HTTP ${response.status}.`);return response.json() as Promise<PackagedArchive>;});cache.set(url,pending);}
 try{return await pending;}catch(error){cache.delete(url);throw error;}
}

export function assemblePackagedRecording(archive:PackagedArchive,run:ReplayIdentity,onProgress:(value:Progress)=>void){
 if(archive?.schema!==1||archive.provenance!=='synthetic'||!Array.isArray(archive.runs)||archive.runs.length!==2)throw new Error('Packaged replay manifest is invalid.');
 const item=archive.runs.find(candidate=>candidate.run.run_id===run.run_id);if(!item||!Array.isArray(item.pages)||!item.pages.length)throw new Error('Packaged recording is unavailable.');
 if(item.run.assignment_id!==run.assignment_id||item.run.event_count!==run.event_count||item.run.conditions_hash!==run.conditions_hash)throw new Error('Packaged recording identity does not match.');
 let recording:CorridorRecording|null=null;for(const page of item.pages){recording=mergeCorridorPage(recording,page);onProgress({loaded:recording.events.length,total:recording.total});}
 if(!recording?.complete||recording.events.length!==run.event_count||recording.comparison_basis_hash!==archive.comparison_basis_hash)throw new Error('Packaged recording is incomplete.');
 if(recording.intervention.kind!==item.role)throw new Error('Packaged intervention label does not match.');
 return recording;
}

export async function loadPackagedRecording(url:string,run:ReplayIdentity,onProgress:(value:Progress)=>void){return assemblePackagedRecording(await fetchArchive(url),run,onProgress);}
