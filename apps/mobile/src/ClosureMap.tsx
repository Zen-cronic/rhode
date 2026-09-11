import React,{useRef} from 'react';
import {View} from 'react-native';
import MapView,{Polyline,Marker} from 'react-native-maps';
import {Text,colors} from './Design';
import {closureGeometry} from './closure-review';
export function ClosureMap({route}:{route:unknown}){
 const ref=useRef<MapView|null>(null),legs=closureGeometry(route),points=legs?.flat();
 if(!points?.length)return <Text>Verified route geometry unavailable.</Text>;
 return <View style={{gap:8}}><MapView ref={ref} style={{height:210,borderRadius:10}} initialRegion={{...points[0],latitudeDelta:.1,longitudeDelta:.1}} onMapReady={()=>ref.current?.fitToCoordinates(points,{edgePadding:{top:24,bottom:24,left:24,right:24},animated:false})}>{legs!.map((leg:any,i:number)=><Polyline key={i} coordinates={leg} strokeColor={colors.orange} strokeWidth={4}/>)}<Marker coordinate={points[0]} title="Reviewed GPS origin"/><Marker coordinate={points.at(-1)!} title="Remaining destination"/></MapView><Text style={{fontSize:12,lineHeight:18}}>Dispatcher-reviewed truck geometry. This preview does not start navigation.</Text></View>;
}
