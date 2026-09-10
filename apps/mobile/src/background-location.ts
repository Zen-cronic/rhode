import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {getDatabase} from './storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {Api,type Identity,type State} from './api';
import {Queue} from './queue';
import {trackingBlock,validSample,type TrackingGrant} from './tracking-policy';
export const TRACKING_TASK='roadstar-active-work-session-v1';
const TOKEN_KEY='roadstar-background-id-token';
let controlQueue:Promise<Queue>|undefined;
function control(){return controlQueue??=(async()=>{const q=new Queue(await getDatabase(),'__tracking_device__');await q.init();return q;})();}
async function grant():Promise<TrackingGrant|null>{return JSON.parse(await (await control()).draft('grant')||'null');}
async function note(message:string){await (await control()).saveDraft('status',message);}
export async function ensureTrackingIdentity(scope:string){const current=await grant();if(current?.enabled&&current.scope!==scope)await stopBackgroundTracking('Tracking stopped because the signed-in workspace changed.');}
export async function trackingStatus(scope:string){const saved=await grant();return {enabled:!!saved?.enabled&&saved.scope===scope,message:saved?.scope===scope?await (await control()).draft('status'):'Background tracking is off.'};}
export async function stopBackgroundTracking(reason='Background tracking stopped.'){
 const failures:unknown[]=[];
 try{const q=await control();const current=await grant();if(current)await q.saveDraft('grant',JSON.stringify({...current,enabled:false}));await note(reason);}catch(error){failures.push(error);}
 try{await SecureStore.deleteItemAsync(TOKEN_KEY);}catch(error){failures.push(error);}
 try{if(await TaskManager.isAvailableAsync()&&await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK))await Location.stopLocationUpdatesAsync(TRACKING_TASK);}catch(error){failures.push(error);}
 if(failures.length)throw new Error(`Tracking shutdown needs attention: ${failures.map(String).join('; ')}`);
}
export async function renewTrackingCredential(identity:Identity,scope:string){
 const current=await grant();if(!current?.enabled||current.scope!==scope||!identity.backgroundCredential)return;
 const permission=await Location.getBackgroundPermissionsAsync();if(!permission.granted){await stopBackgroundTracking('Background location permission revoked. Sharing is off.');return;}
 const credential=await identity.backgroundCredential();const still=await grant();if(still?.id!==current.id||!still.enabled)return;
 if(current.expiresAt!==credential.expiresAt){await SecureStore.setItemAsync(TOKEN_KEY,credential.token,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY});await (await control()).saveDraft('grant',JSON.stringify({...current,expiresAt:credential.expiresAt}));}
}
export async function startBackgroundTracking(api:Api,scope:string,assignmentId:string,sessionId:string){
 if(!api.identity.backgroundCredential)throw new Error('Background tracking requires an authenticated Firebase driver, not a demo identity.');
 if(!await TaskManager.isAvailableAsync())throw new Error('Background location requires a native development build. Expo Go is not sufficient.');
 const foreground=await Location.requestForegroundPermissionsAsync();if(!foreground.granted)throw new Error('Location permission denied. Sharing remains off.');
 const permission=await Location.requestBackgroundPermissionsAsync();if(!permission.granted)throw new Error('Allow background location in device settings before enabling session tracking.');
 const state=await api.state();const credential=await api.identity.backgroundCredential();const driverId=state.actor?.driverId;
 if(!driverId)throw new Error('Verified driver identity required.');
 const current:TrackingGrant={id:Crypto.randomUUID(),scope,origin:api.origin,userId:api.identity.id,carrierId:api.identity.carrier,driverId,sessionId,assignmentId,startedAt:new Date().toISOString(),expiresAt:credential.expiresAt,enabled:true};
 const blocked=trackingBlock(current,state,Date.now(),true);if(blocked)throw new Error(blocked);
 await stopBackgroundTracking('Preparing authorized work-session tracking.');await SecureStore.setItemAsync(TOKEN_KEY,credential.token,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY});await (await control()).saveDraft('grant',JSON.stringify(current));
 try{await Location.startLocationUpdatesAsync(TRACKING_TASK,{accuracy:Location.Accuracy.High,timeInterval:15000,distanceInterval:50,pausesUpdatesAutomatically:false,showsBackgroundLocationIndicator:true,foregroundService:{notificationTitle:'RoadStar work session',notificationBody:'Location is shared for your active trip. End sharing in RoadStar.',killServiceOnDestroy:true}});await note('Background tracking enabled for this active work session.');}catch(error){await stopBackgroundTracking(`Could not start background tracking: ${String(error)}`);throw error;}
}
TaskManager.defineTask<{locations:Location.LocationObject[]}>(TRACKING_TASK,async({data,error})=>{
 const current=await grant();if(!current?.enabled)return;
 if(error){await stopBackgroundTracking(`Background location unavailable: ${error.message}`);return;}
 try{
   const permission=await Location.getBackgroundPermissionsAsync();if(!permission.granted||Date.now()>=Date.parse(current.expiresAt)){await stopBackgroundTracking(!permission.granted?'Background location permission revoked.':'Sign-in token expired. Reopen RoadStar and enable tracking.');return;}
   const token=await SecureStore.getItemAsync(TOKEN_KEY);if(!token){await stopBackgroundTracking('Tracking credential unavailable. Sign in again.');return;}
   const api=new Api(current.origin,{id:current.userId,carrier:current.carrierId,role:'driver',token:async()=>token});const response=await api.request('/api/state');
   if(response.status!==200){if(response.status>=400&&response.status<500)await stopBackgroundTracking('Tracking authorization could not be verified. Sign in again.');else await note('Tracking paused: server unavailable; no GPS samples retained.');return;}
   const state=response.body as State;const blocked=trackingBlock(current,state,Date.now(),permission.granted);if(blocked){await stopBackgroundTracking(blocked);return;}
   const queue=new Queue(await getDatabase(),current.scope);await queue.init();
   const duty=state.resources.find(r=>r.id===current.driverId)?.duty;if(!duty){await note('Tracking paused: current duty state is unavailable.');return;}
   for(const location of data?.locations??[]){const latest=await grant();if(latest?.id!==current.id||!latest.enabled)return;if(!validSample(current,location.timestamp,location.coords.accuracy,Date.now()))continue;
     const sampleId=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${current.id}:${location.timestamp}:${location.coords.latitude}:${location.coords.longitude}`);
     await queue.enqueue(Crypto.randomUUID(),'/api/telemetry',{id:sampleId,assignmentId:current.assignmentId,sessionId:current.sessionId,at:new Date(location.timestamp).toISOString(),position:{lat:location.coords.latitude,lng:location.coords.longitude},accuracyM:location.coords.accuracy,speedKph:location.coords.speed===null||location.coords.speed<0?null:location.coords.speed*3.6,odometerKm:null,duty,provenance:'live'},0,'Background device location');
   }
   await queue.flush(async command=>{const latest=await grant();if(latest?.id!==current.id||!latest.enabled||!await SecureStore.getItemAsync(TOKEN_KEY))throw new Error('Tracking stopped before transfer.');if(command.path!=='/api/telemetry')throw new Error('Non-location actions wait for the foreground application.');return api.request(command.path,command);},command=>command.path==='/api/telemetry');
   await note('Background tracking active. Last session check '+new Date().toLocaleTimeString());
 }catch(error){await note(`Tracking paused: ${String(error)}. No unverified GPS samples retained.`);}
});
