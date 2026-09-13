import {useCallback,useState} from 'react';
import {CorridorReplay,type ReplayRun,type RecordingLoader} from './CorridorReplay';
import {loadPackagedRecording} from './packaged-corridor-replay';
import type {Session} from './api';

const source='/demo/matched-401-replay.json';
const baseline:ReplayRun={run_id:'a06e48f8-6026-49d9-a72e-69123dd0690d',assignment_id:'3a5d735f-7786-4cef-8277-9138d90d8829',event_count:2401,conditions_hash:'cf997f3a65fae4cbe7fa4f320dada08e783dc78885780b7f528d45851a66f32c'};
const slowdown:ReplayRun={run_id:'f2cc803a-2502-4127-982a-192784eeaa7e',assignment_id:'f0f389f1-ac17-4a78-943d-1d1d14a8e403',event_count:2401,conditions_hash:'871d7037d01d3105a6c107ae8750f57af59a48d2b5850f95d66adf73dbf1e463'};

export function PackagedCorridorReplay({session,online}:{session:Session;online:boolean}){
 const loader=useCallback<RecordingLoader>((run,onProgress)=>loadPackagedRecording(source,run,onProgress),[]);
 return <><p className="fine packaged-replay-intro">Two complete API-acknowledged synthetic recordings are packaged with this preview. The replay is read-only: its controls move only the historical view cursor and issue no operational command.</p><CorridorReplay run={baseline} matchedRun={slowdown} session={session} online={online} recordingLoader={loader} initialOpen initialCompare/></>;
}

export function PackagedCorridorDemo({session,online}:{session:Session;online:boolean}){
 const[mounted,setMounted]=useState(false);
 return <details className="panel simulator-controls packaged-corridor-demo" onToggle={event=>setMounted(event.currentTarget.open)}><summary>Judge replay · matched Highway 401 slowdown</summary>{mounted&&<div className="simulator-content"><PackagedCorridorReplay session={session} online={online}/></div>}</details>;
}
