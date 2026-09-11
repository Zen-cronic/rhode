import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {pool,migrate} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {milton} from '../services/api/src/fixtures.ts';
const db=pool('postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar'),store=new Store(db),carrier=`geofence-ui-${randomUUID()}`,cmd=()=>({key:randomUUID(),expectedVersion:1});
try{await migrate(db);await store.seed(carrier);const dispatcher=await store.membership('demo-dispatcher',carrier),driver=await store.membership('demo-driver-1',carrier),simulator=await store.membership('demo-simulator',carrier);const trip:any=await store.dispatch(dispatcher,cmd(),{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});await store.respond(driver,cmd(),{assignmentId:trip.id,action:'accept'});
await db.query("UPDATE stops SET location=ST_SetSRID(ST_MakePoint($2,$3),4326)::geography WHERE carrier_id=$1 AND load_id='RS-1042' AND id='london-dock'",[carrier,milton.lng,milton.lat]);
await store.ingest(simulator,cmd(),{id:'overlap-observation',assignmentId:trip.id,at:'2026-09-13T12:30:00Z',position:milton,accuracyM:10,odometerKm:1000,speedKph:0,duty:'on_duty',provenance:'synthetic'});await writeFile('/tmp/roadstar-geofence-ui-fixture.json',JSON.stringify({carrier,assignmentId:trip.id}));console.log('Synthetic overlap fixture ready');}finally{await db.end();}
