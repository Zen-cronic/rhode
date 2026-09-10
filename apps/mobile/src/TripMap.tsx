import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Platform,Pressable,Text,View} from 'react-native';
import MapView,{Marker,Polyline} from 'react-native-maps';
import type {Load} from '../../../packages/domain/src/index';
import type {Api} from './api';
import type {Queue} from './queue';
import {readRoute,saveRoute,routeCacheKey,routeFailureAllowsCache,type RouteRequest,type StoredRoute} from './routes';
type Props={load:Load;truckId:string;truckVersion?:number;api:Api;queue:Queue|null};
type ViewState={key:string;stored:StoredRoute|null;loading:boolean;message:string;cached:boolean};
export function TripMap({load,truckId,truckVersion,api,queue}:Props){
 const map=useRef<MapView|null>(null);const [mapReady,setMapReady]=useState(false);const [retry,setRetry]=useState(0);
 const request=useMemo<RouteRequest|null>(()=>truckVersion===undefined?null:{loadId:load.id,truckId,truckVersion,pickup:{lat:load.pickup.lat,lng:load.pickup.lng},delivery:{lat:load.delivery.lat,lng:load.delivery.lng}},[load.id,truckId,truckVersion,load.pickup.lat,load.pickup.lng,load.delivery.lat,load.delivery.lng]);
 const key=request?routeCacheKey(request):'';const [state,setState]=useState<ViewState>({key:'',stored:null,loading:false,message:'Waiting for the downloaded truck record.',cached:false});
 const visible=state.key===key?state:{key,stored:null,loading:true,message:'Loading truck route…',cached:false};
 useEffect(()=>{let active=true;if(!request||!queue)return;const captured=request;setState({key,stored:null,loading:true,message:'Loading truck route…',cached:false});
 void(async()=>{let cached:StoredRoute|null=null;try{cached=await readRoute(queue,captured);if(active&&cached)setState({key,stored:cached,loading:true,message:'Downloaded route; checking for updates…',cached:true});
 const result=await api.request(`/api/route?loadId=${encodeURIComponent(captured.loadId)}&truckId=${encodeURIComponent(captured.truckId)}`);
 if(result.status!==200){const message=result.body?.error?.message??`Routing returned HTTP ${result.status}.`;if(!routeFailureAllowsCache(result.status)){cached=null;await queue.saveDraft(key,'');}throw new Error(message);}
 const stored=await saveRoute(queue,captured,result.body);if(active)setState({key,stored,loading:false,message:'Truck route synchronized.',cached:false});
 }catch(error){if(active)setState({key,stored:cached,loading:false,message:`${cached?'Route update unavailable; showing downloaded route':'Truck route unavailable'}: ${error instanceof Error?error.message:String(error)}`,cached:!!cached});}})();
 return()=>{active=false;};},[api,queue,key,retry,request]);
 useEffect(()=>{const listener=AppState.addEventListener('change',value=>{if(value==='active')setRetry(x=>x+1);});return()=>listener.remove();},[]);
 const routeCoordinates=useMemo(()=>visible.stored?.route.coordinates.map(([longitude,latitude])=>({latitude,longitude}))??[],[visible.stored]);
 useEffect(()=>{if(mapReady&&routeCoordinates.length>1)map.current?.fitToCoordinates(routeCoordinates,{edgePadding:{top:36,right:28,bottom:36,left:28},animated:false});},[mapReady,routeCoordinates]);
 const unavailable=Platform.OS==='android'&&!process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
 return <View style={{gap:8}}>
 {unavailable?<Text style={{color:'#a32b2b'}}>Map unavailable. Configure a restricted Android Maps key and rebuild the native app. Stop addresses remain below.</Text>:<View style={{height:260,borderRadius:8,overflow:'hidden'}}><MapView ref={map} style={{flex:1}} mapType="hybrid" initialRegion={{latitude:load.pickup.lat,longitude:load.pickup.lng,latitudeDelta:1.5,longitudeDelta:1.5}} onMapReady={()=>setMapReady(true)} accessibilityLabel={visible.stored?'Truck road route with pickup and delivery stops':'Pickup and delivery markers; truck route not available'}><Marker coordinate={{latitude:load.pickup.lat,longitude:load.pickup.lng}} title={load.pickup.name} description="Pickup"/><Marker coordinate={{latitude:load.delivery.lat,longitude:load.delivery.lng}} title={load.delivery.name} description="Delivery"/>{routeCoordinates.length>1?<Polyline coordinates={routeCoordinates} strokeColor="#145b8d" strokeWidth={5} geodesic={false}/>:null}</MapView></View>}
 <View style={{flexDirection:'row',alignItems:'center',gap:8}}>{visible.loading?<ActivityIndicator accessibilityLabel="Loading verified truck route"/>:null}<Text style={{flex:1,color:visible.stored?'#20364c':'#5c6d7e'}}>{visible.message}</Text></View>
 {visible.stored?<><Text style={{fontWeight:'600',color:'#20364c'}}>{Math.round(visible.stored.route.drivingMinutes)} min planned driving · {visible.cached?'Downloaded':'Synchronized'} route</Text><Text style={{fontSize:12,color:'#5c6d7e'}}>Saved {new Date(visible.stored.savedAt).toLocaleString()} · {visible.stored.route.dataset}</Text><Text style={{fontSize:12,color:'#5c6d7e'}}>Truck {truckId}: {visible.stored.route.profile.height} m high · {visible.stored.route.profile.width} m wide · {visible.stored.route.profile.length} m long · {visible.stored.route.profile.weight} t gross · {visible.stored.route.profile.evidence}</Text><Text style={{fontSize:12,color:'#5c6d7e'}}>{visible.stored.route.warning}{visible.cached?' Current road conditions have not been refreshed. Base-map imagery may need a connection.':''}</Text></>:<Text style={{fontSize:12,color:'#5c6d7e'}}>No route line is drawn without verified truck geometry.</Text>}
 <Pressable accessibilityRole="button" accessibilityState={{disabled:visible.loading||!request||!queue}} disabled={visible.loading||!request||!queue} onPress={()=>setRetry(x=>x+1)} style={{minHeight:44,padding:12,backgroundColor:'#edf4fa',borderRadius:8,alignItems:'center',opacity:visible.loading?.5:1}}><Text style={{fontWeight:'600',color:'#145b8d'}}>Refresh truck route</Text></Pressable>
 </View>;
}
