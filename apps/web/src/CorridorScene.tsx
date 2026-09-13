import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Matrix4,Quaternion,Vector3,type InstancedMesh,type OrthographicCamera} from 'three';
import type {CorridorComparisonSpeedProfileEntry,CorridorEvent,CorridorRoute} from './corridor-replay-model';

export type CorridorCamera='overview'|'plan';

export interface CorridorSceneProps{
 route:CorridorRoute;
 event:CorridorEvent;
 camera:CorridorCamera;
 reducedMotion:boolean;
 playing:boolean;
 onUnavailable:()=>void;
 comparison?:{baseline:CorridorEvent;disrupted:CorridorEvent};
 speedProfile?:CorridorComparisonSpeedProfileEntry[];
}

const ORANGE='#e65c32',IVORY='#f5f3ed',GRAPHITE='#242729';
type Point3=[number,number,number];

type RouteProjection={points:Point3[];latitude:number;longitude:number;longitudeScale:number;centreX:number;centreZ:number;scale:number};
type MarkerProjection={position:Point3;heading:number};

function projectRoute(route:CorridorRoute):RouteProjection{
 const coordinates=route.geometry.coordinates;
 const latitude=coordinates.reduce((sum,point)=>sum+point[1],0)/coordinates.length;
 const longitude=coordinates.reduce((sum,point)=>sum+point[0],0)/coordinates.length;
 const longitudeScale=Math.max(.15,Math.cos(latitude*Math.PI/180));
 const raw=coordinates.map(([lng,lat])=>[(lng-longitude)*longitudeScale,0,(latitude-lat)] as Point3);
 const minX=Math.min(...raw.map(point=>point[0])),maxX=Math.max(...raw.map(point=>point[0]));
 const minZ=Math.min(...raw.map(point=>point[2])),maxZ=Math.max(...raw.map(point=>point[2]));
 const span=Math.max(maxX-minX,maxZ-minZ,.000001),scale=15/span;
 const centreX=(minX+maxX)/2,centreZ=(minZ+maxZ)/2;
 const points=raw.map(([x,y,z])=>[(x-centreX)*scale,y,(z-centreZ)*scale] as Point3);
 return{points,latitude,longitude,longitudeScale,centreX,centreZ,scale};
}

function projectPosition(projection:RouteProjection,value:{lat:number;lng:number}):MarkerProjection{
 const position:Point3=[
  ((value.lng-projection.longitude)*projection.longitudeScale-projection.centreX)*projection.scale,
  .32,
  ((projection.latitude-value.lat)-projection.centreZ)*projection.scale,
 ];
 const nearest=projection.points.reduce((best,point,index)=>{
  const distance=(point[0]-position[0])**2+(point[2]-position[2])**2;
  return distance<best.distance?{index,distance}:best;
 },{index:0,distance:Number.POSITIVE_INFINITY}).index;
 const next=projection.points[Math.min(projection.points.length-1,nearest+1)]??projection.points[nearest];
 const previous=projection.points[Math.max(0,nearest-1)]??projection.points[nearest];
 return{position,heading:Math.atan2(next[0]-previous[0],next[2]-previous[2])};
}

function projectMarker(projection:RouteProjection,event:CorridorEvent):MarkerProjection{
 return projectPosition(projection,event.sample.position);
}

function InstancedRail({points,width,height,color,y}:{points:Point3[];width:number;height:number;color:string;y:number}){
 const ref=useRef<InstancedMesh>(null),segments=Math.max(0,points.length-1);
 useLayoutEffect(()=>{
  if(!ref.current)return;
  const matrix=new Matrix4(),quaternion=new Quaternion(),midpoint=new Vector3(),scale=new Vector3(),up=new Vector3(0,1,0);
  for(let index=0;index<segments;index++){
   const start=new Vector3(...points[index]),end=new Vector3(...points[index+1]);
   const delta=end.clone().sub(start),length=delta.length();
   midpoint.copy(start).add(end).multiplyScalar(.5);midpoint.y=y;
   quaternion.setFromAxisAngle(up,Math.atan2(delta.x,delta.z));
   scale.set(width,height,Math.max(length,.01));matrix.compose(midpoint,quaternion,scale);
   ref.current.setMatrixAt(index,matrix);
  }
  ref.current.instanceMatrix.needsUpdate=true;
 },[points,segments,width,height,y]);
 if(!segments)return null;
 return <instancedMesh ref={ref} args={[undefined,undefined,segments]} receiveShadow>
  <boxGeometry args={[1,1,1]}/><meshStandardMaterial color={color} roughness={.78}/>
 </instancedMesh>;
}

function InstancedSpeedFins({projection,profile,routeOrdinal}:{projection:RouteProjection;profile:CorridorComparisonSpeedProfileEntry[];routeOrdinal:number}){
 const baselineRef=useRef<InstancedMesh>(null),disruptedRef=useRef<InstancedMesh>(null);
 const values=useMemo(()=>profile.filter(entry=>entry.routeOrdinal===routeOrdinal).map(entry=>({
  baseline:entry.baseline.speedKph===null?null:{marker:projectPosition(projection,entry.baseline.position),speedKph:entry.baseline.speedKph},
  disrupted:entry.disrupted.speedKph===null?null:{marker:projectPosition(projection,entry.disrupted.position),speedKph:entry.disrupted.speedKph},
 })),[projection,profile]);
 const baseline=values.flatMap(value=>value.baseline?[value.baseline]:[]),disrupted=values.flatMap(value=>value.disrupted?[value.disrupted]:[]);
 useLayoutEffect(()=>{
  const place=(mesh:InstancedMesh|null,items:typeof baseline,side:number)=>{
   if(!mesh)return;
   const matrix=new Matrix4(),rotation=new Quaternion(),position=new Vector3(),scale=new Vector3();
   items.forEach((item,index)=>{
    const height=Math.max(.025,Math.min(.46,item.speedKph/180));
    const lateral=.22*side,perpendicularX=Math.cos(item.marker.heading),perpendicularZ=-Math.sin(item.marker.heading);
    position.set(item.marker.position[0]+perpendicularX*lateral,.19+height/2,item.marker.position[2]+perpendicularZ*lateral);
    scale.set(side<0?.022:.028,height,side<0?.022:.028);matrix.compose(position,rotation,scale);mesh.setMatrixAt(index,matrix);
   });
   mesh.instanceMatrix.needsUpdate=true;
  };
  place(baselineRef.current,baseline,-1);place(disruptedRef.current,disrupted,1);
 },[baseline,disrupted]);
 return <group>
  {baseline.length>0&&<instancedMesh ref={baselineRef} args={[undefined,undefined,baseline.length]}><cylinderGeometry args={[1,1,1,6]}/><meshStandardMaterial color={IVORY} roughness={.68}/></instancedMesh>}
  {disrupted.length>0&&<instancedMesh ref={disruptedRef} args={[undefined,undefined,disrupted.length]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color={ORANGE} roughness={.62}/></instancedMesh>}
 </group>;
}

function RouteObject({route,projection,marker,playing,comparison,speedProfile}:{route:CorridorRoute;projection:RouteProjection;marker:MarkerProjection;playing:boolean;comparison?:{baseline:MarkerProjection;disrupted:MarkerProjection};speedProfile?:CorridorComparisonSpeedProfileEntry[]}){
 const stops=route.stop_indices.map(index=>projection.points[index]).filter(Boolean);
 return <group>
  <InstancedRail points={projection.points} width={.34} height={.12} y={.10} color="#434846"/>
  <InstancedRail points={projection.points} width={.09} height={.05} y={.205} color={ORANGE}/>
  {stops.map((point,index)=><group key={`${point[0]}-${point[2]}-${index}`} position={[point[0],.20,point[2]]}>
   <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><cylinderGeometry args={[.32,.32,.07,24]}/><meshStandardMaterial color={index===stops.length-1?ORANGE:IVORY} roughness={.82}/></mesh>
   <mesh position={[0,.12,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.13,.2,20]}/><meshBasicMaterial color={GRAPHITE}/></mesh>
  </group>)}
  {speedProfile?.length?<InstancedSpeedFins projection={projection} profile={speedProfile} routeOrdinal={route.ordinal}/>:null}
  {comparison?<>
   <InstancedRail points={[comparison.baseline.position,comparison.disrupted.position]} width={.035} height={.025} y={.34} color="#aeb1a9"/>
   <TruckMarker position={comparison.baseline.position} heading={comparison.baseline.heading} playing={false} tone="baseline"/>
   <TruckMarker position={comparison.disrupted.position} heading={comparison.disrupted.heading} playing={playing} tone="disrupted"/>
  </>:<TruckMarker position={marker.position} heading={marker.heading} playing={playing} tone="disrupted"/>}
 </group>;
}

function TruckMarker({position,heading,playing,tone}:{position:Point3;heading:number;playing:boolean;tone:'baseline'|'disrupted'}){
 const baseline=tone==='baseline',body=baseline?IVORY:ORANGE,cab=baseline?'#d4d3cc':IVORY,halo=baseline?'#f5f3ed':'#f2b098';
 return <group position={position} rotation={[0,heading,0]}>
  <mesh position={[0,.19,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.58,.7,28]}/><meshBasicMaterial color={playing?halo:baseline?'#d7d6cf':'#fff0df'}/></mesh>
  <group>
   <mesh position={[0,.24,-.15]} castShadow><boxGeometry args={[.48,.36,.88]}/><meshStandardMaterial color={body} roughness={.7}/></mesh>
   <mesh position={[0,.28,.46]} castShadow><boxGeometry args={[.45,.42,.36]}/><meshStandardMaterial color={cab} roughness={.75}/></mesh>
   <mesh position={[0,.34,.645]}><boxGeometry args={[.31,.16,.02]}/><meshStandardMaterial color="#4b5854" roughness={.45}/></mesh>
  </group>
 </group>;
}

function CameraRig({view,reducedMotion,position}:{view:CorridorCamera;reducedMotion:boolean;position:Point3}){
 const{camera,size,invalidate}=useThree(),destination=useRef(new Vector3()),target=useRef(new Vector3()),activeTarget=useRef(new Vector3()),zoom=useRef(42),initial=useRef(true);
 useEffect(()=>{
  const narrow=size.width<640;
  destination.current.set(...(view==='plan'?[0,20,.001]:narrow?[12,13,16]:[10.5,11.5,14]) as Point3);
  target.current.set(view==='plan'?0:position[0]*.08,0,view==='plan'?0:position[2]*.08);
  camera.up.set(0,view==='plan'?0:1,view==='plan'?-1:0);
  zoom.current=Math.min(size.width/(narrow?17.5:15.5),size.height/(view==='plan'?(narrow?14.5:13.5):(narrow?13.5:11.75)));
  if(initial.current||reducedMotion){camera.position.copy(destination.current);activeTarget.current.copy(target.current);camera.lookAt(activeTarget.current);(camera as OrthographicCamera).zoom=zoom.current;camera.updateProjectionMatrix();initial.current=false;}
  invalidate();
 },[view,reducedMotion,size.width,size.height,camera,invalidate,position]);
 useFrame((_,delta)=>{
  const orthographic=camera as OrthographicCamera,moving=camera.position.distanceToSquared(destination.current)>.0001||activeTarget.current.distanceToSquared(target.current)>.0001||Math.abs(orthographic.zoom-zoom.current)>.005;
  if(!moving)return;
  const factor=reducedMotion?1:1-Math.exp(-8*Math.min(delta,.1));
  camera.position.lerp(destination.current,factor);activeTarget.current.lerp(target.current,factor);orthographic.zoom+=(zoom.current-orthographic.zoom)*factor;camera.lookAt(activeTarget.current);camera.updateProjectionMatrix();invalidate();
 });
 return null;
}

function ContextWatch({onUnavailable}:{onUnavailable:()=>void}){
 const{gl}=useThree();
 useEffect(()=>{const canvas=gl.domElement,fail=(event:Event)=>{event.preventDefault();onUnavailable();};canvas.addEventListener('webglcontextlost',fail);return()=>canvas.removeEventListener('webglcontextlost',fail);},[gl,onUnavailable]);
 return null;
}

export default function CorridorScene(props:CorridorSceneProps){
 const projection=useMemo(()=>projectRoute(props.route),[props.route.key]);
 const marker=useMemo(()=>projectMarker(projection,props.event),[projection,props.event.sample.position.lat,props.event.sample.position.lng]);
 const comparison=useMemo(()=>props.comparison?{
  baseline:projectMarker(projection,props.comparison.baseline),
  disrupted:projectMarker(projection,props.comparison.disrupted),
 }:undefined,[projection,props.comparison?.baseline.sample.position.lat,props.comparison?.baseline.sample.position.lng,props.comparison?.disrupted.sample.position.lat,props.comparison?.disrupted.sample.position.lng]);
 return <div className="corridor-canvas" aria-label="Three-dimensional recorded route view">
  <Canvas orthographic frameloop="demand" dpr={[1,1.5]} shadows gl={{antialias:true,powerPreference:'high-performance'}} camera={{position:[10.5,11.5,14],zoom:42,near:.1,far:100}} fallback={<span className="corridor-webgl-fallback">3D unavailable. Use diagram.</span>}>
   <color attach="background" args={['#202325']}/><fog attach="fog" args={['#202325',21,40]}/>
   <ambientLight intensity={1.25}/><directionalLight position={[8,14,9]} intensity={2.2} castShadow shadow-mapSize={[1024,1024]}/>
   <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.06,0]} receiveShadow><planeGeometry args={[24,19]}/><meshStandardMaterial color="#2b2f30" roughness={.95}/></mesh>
   <gridHelper args={[22,14,'#464c48','#303533']} position={[0,-.045,0]}/>
   <RouteObject route={props.route} projection={projection} marker={marker} playing={props.playing} comparison={comparison} speedProfile={props.speedProfile}/>
   <CameraRig view={props.camera} reducedMotion={props.reducedMotion} position={marker.position}/><ContextWatch onUnavailable={props.onUnavailable}/>
  </Canvas>
 </div>;
}
