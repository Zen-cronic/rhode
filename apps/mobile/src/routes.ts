export type RouteRequest={loadId:string;truckId:string;truckVersion:number;pickup:{lat:number;lng:number};delivery:{lat:number;lng:number}};
export type TruckRoute={fingerprint:string;loadId:string;truckId:string;coordinates:[number,number][];drivingMinutes:number;profile:{height:number;width:number;length:number;weight:number;axle_load:number;hazmat:boolean;evidence:string};dataset:string;routing_evidence:'valhalla-truck';warning:string};
export type StoredRoute={savedAt:string;route:TruckRoute};
export interface RouteCache{draft(name:string):Promise<string>;saveDraft(name:string,value:string):Promise<void>}
export function routeCacheKey(request:RouteRequest){return 'truck-route:'+JSON.stringify(request);}
export function verifiedRoute(value:unknown,request:RouteRequest):TruckRoute{
 const route=value as TruckRoute;
 if(!route||route.routing_evidence!=='valhalla-truck'||route.loadId!==request.loadId||route.truckId!==request.truckId||typeof route.fingerprint!=='string'||!route.fingerprint||!Number.isFinite(route.drivingMinutes)||route.drivingMinutes<0||typeof route.dataset!=='string'||!route.dataset||typeof route.warning!=='string'||!route.profile||typeof route.profile.hazmat!=='boolean'||!['operator-verified','synthetic-scenario'].includes(route.profile.evidence)||!['height','width','length','weight','axle_load'].every(k=>Number.isFinite((route.profile as any)[k])&&(route.profile as any)[k]>0)||!Array.isArray(route.coordinates)||route.coordinates.length<2||!route.coordinates.every(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Math.abs(p[0])<=180&&Number.isFinite(p[1])&&Math.abs(p[1])<=90))throw new Error('The server did not return complete truck-route evidence.');
 return route;
}
export async function readRoute(cache:RouteCache,request:RouteRequest):Promise<StoredRoute|null>{
 try{const value=JSON.parse(await cache.draft(routeCacheKey(request))||'null');if(!value||!Number.isFinite(Date.parse(value.savedAt)))return null;return {savedAt:value.savedAt,route:verifiedRoute(value.route,request)};}catch{return null;}
}
export async function saveRoute(cache:RouteCache,request:RouteRequest,value:unknown):Promise<StoredRoute>{const stored={savedAt:new Date().toISOString(),route:verifiedRoute(value,request)};await cache.saveDraft(routeCacheKey(request),JSON.stringify(stored));return stored;}
export function routeFailureAllowsCache(status:number){return status===408||status===425||status===429||status>=500;}
