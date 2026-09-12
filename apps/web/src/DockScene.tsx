import { Component, useEffect, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { PCFShadowMap, Vector3, type OrthographicCamera } from 'three'
import './dock-scene.css'

type Selection = 'truck' | 'dock' | 'fence'
type CameraView = 'overview' | 'dock' | 'top'

export interface DockSceneProps {
  atDock: boolean
  held: boolean
  selected: Selection
  onSelect: (value: Selection) => void
  camera: CameraView
  reducedMotion: boolean
  onUnavailable: () => void
}

const IVORY = '#f5f3ed'
const GRAPHITE = '#242729'
const ORANGE = '#e65c32'
type Point = [number, number, number]

function Block({ position, size, color, rotation, ...props }: {
  position: Point; size: Point; color: string; rotation?: Point
  onClick?: (event: ThreeEvent<MouseEvent>) => void
}) {
  return <mesh position={position} rotation={rotation} castShadow receiveShadow {...props}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.83} />
  </mesh>
}

function Wheel({ position }: { position: Point }) {
  return <group position={position} rotation={[0, 0, Math.PI / 2]}>
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[0.28, 0.28, 0.2, 16]} />
      <meshStandardMaterial color="#252728" roughness={0.94} />
    </mesh>
    <mesh>
      <cylinderGeometry args={[0.14, 0.14, 0.215, 12]} />
      <meshStandardMaterial color="#a4a7a1" metalness={0.4} roughness={0.45} />
    </mesh>
    <mesh>
      <cylinderGeometry args={[0.055, 0.055, 0.23, 10]} />
      <meshStandardMaterial color="#555b5c" roughness={0.6} />
    </mesh>
  </group>
}

function Truck({ selected, onSelect }: { selected: boolean; onSelect: DockSceneProps['onSelect'] }) {
  return <group onClick={(event) => { event.stopPropagation(); onSelect('truck') }}>
    {/* Trailer rear meets the middle loading bay. Vehicle geometry is illustrative. */}
    <Block position={[0, 0.51, 0.25]} size={[1.55, 0.18, 5.5]} color="#444949" />
    <Block position={[0, 1.49, -0.36]} size={[1.8, 1.72, 4.35]} color={IVORY} />
    <Block position={[0, 2.37, -0.36]} size={[1.83, 0.06, 4.4]} color="#dedfd7" />
    <Block position={[0, 0.68, -0.36]} size={[1.84, 0.12, 4.4]} color="#a8ada7" />
    {[-1, 1].map((side) => <group key={side}>
      <Block position={[side * 0.908, 1.02, -0.36]} size={[0.026, 0.045, 4.05]} color={selected ? ORANGE : '#b4b8b1'} />
      {[-2.3, -1.68, -1.06, -0.44, 0.18, 0.8, 1.42].map((z) =>
        <Block key={z} position={[side * 0.908, 1.68, z]} size={[0.023, 1.2, 0.022]} color="#d6d8d1" />)}
      {[-1.93, -1.25, 2.7].map((z) => <Wheel key={z} position={[side * 0.8, 0.39, z]} />)}
      <Block position={[side * 0.82, 0.49, 1.85]} size={[0.15, 0.13, 0.68]} color="#888f8b" />
    </group>)}
    {/* A stepped cab, dark wraparound glazing and restrained safety details. */}
    <Block position={[0, 1.16, 2.45]} size={[1.69, 1.26, 1.25]} color={IVORY} />
    <Block position={[0, 1.86, 2.22]} size={[1.7, 0.22, 0.86]} color="#e3e5dd" />
    <Block position={[0, 1.43, 3.09]} size={[1.46, 0.52, 0.022]} color="#465552" rotation={[-0.08, 0, 0]} />
    {[-1, 1].map((side) => <group key={side}>
      <Block position={[side * 0.854, 1.49, 2.57]} size={[0.018, 0.46, 0.68]} color="#465552" />
      <Block position={[side * 0.94, 1.36, 2.94]} size={[0.13, 0.26, 0.11]} color={GRAPHITE} />
      <Block position={[side * 0.61, 0.89, 3.09]} size={[0.29, 0.13, 0.04]} color="#fff6d9" />
    </group>)}
    <Block position={[0, 0.69, 3.11]} size={[1.68, 0.16, 0.12]} color="#858e88" />
    <Block position={[0, 0.94, 3.097]} size={[0.66, 0.26, 0.026]} color="#424b48" />
    <Block position={[0, 1.12, 3.109]} size={[0.64, 0.04, 0.025]} color={ORANGE} />
    {selected && <>
      <Block position={[-1.18, 0.025, 0.45]} size={[0.055, 0.026, 5.9]} color={ORANGE} />
      <Block position={[1.18, 0.025, 0.45]} size={[0.055, 0.026, 5.9]} color={ORANGE} />
      <Block position={[0, 0.025, 3.4]} size={[2.4, 0.026, 0.055]} color={ORANGE} />
    </>}
  </group>
}

function Warehouse({ selected, onSelect }: { selected: boolean; onSelect: DockSceneProps['onSelect'] }) {
  return <group onClick={(event) => { event.stopPropagation(); onSelect('dock') }}>
    <Block position={[0, 1.62, -4.03]} size={[9.5, 3.24, 3.2]} color="#c6cbc2" />
    <Block position={[0, 3.27, -4.03]} size={[9.76, 0.17, 3.42]} color="#34383a" />
    <Block position={[0, 3.38, -4.03]} size={[9.35, 0.07, 3.05]} color="#555a59" />
    {Array.from({ length: 18 }, (_, index) => <Block key={index} position={[-4.5 + index * 0.53, 3.43, -4.03]} size={[0.025, 0.035, 3.05]} color="#707572" />)}
    <Block position={[0, 2.63, -2.407]} size={[9.52, 0.53, 0.05]} color="#dfe2d9" />
    <Block position={[0, 2.29, -2.34]} size={[9.7, 0.11, 0.28]} color="#626e65" />
    {[-3.12, 0, 3.12].map((x) => <group key={x}>
      <Block position={[x, 1.19, -2.36]} size={[2.38, 2.19, 0.12]} color="#414b46" />
      <Block position={[x, 1.19, -2.276]} size={[1.97, 1.89, 0.055]} color="#89958a" />
      {Array.from({ length: 8 }, (_, index) => <Block key={index} position={[x, 0.39 + index * 0.22, -2.24]} size={[1.97, 0.016, 0.026]} color="#66766b" />)}
      <Block position={[x, 0.24, -2.03]} size={[2.5, 0.31, 0.59]} color="#959e92" />
      {[-1.11, 1.11].map((edge) => <Block key={edge} position={[x + edge, 0.65, -2.12]} size={[0.13, 0.79, 0.18]} color={GRAPHITE} />)}
      <Block position={[x, 2.69, -2.365]} size={[0.31, 0.19, 0.045]} color={x === 0 && selected ? ORANGE : '#58655d'} />
      {/* Geometric bay markers avoid inventing source identifiers. */}
      {[-0.07, 0.07].map((offset) => <Block key={offset} position={[x + offset, 2.69, -2.334]} size={[0.033, 0.085, 0.015]} color={IVORY} />)}
    </group>)}
    <Block position={[-3.36, 3.64, -4.43]} size={[1.39, 0.39, 0.99]} color="#a7afa3" />
    <Block position={[-3.36, 3.86, -4.43]} size={[1.46, 0.08, 1.06]} color="#5b655f" />
    <Block position={[-1.8, 3.62, -4.43]} size={[0.67, 0.3, 0.67]} color="#a7afa3" />
    {selected && <Block position={[0, 2.3, -2.173]} size={[2.38, 0.075, 0.07]} color={ORANGE} />}
  </group>
}

function Fence({ selected, held, onSelect }: { selected: boolean; held: boolean; onSelect: DockSceneProps['onSelect'] }) {
  const color = selected ? ORANGE : held ? '#a57942' : '#939b8e'
  return <group onClick={(event) => { event.stopPropagation(); onSelect('fence') }}>
    {/* Open construction signals a facility illustration, not a mapped boundary. */}
    {Array.from({ length: 13 }, (_, i) => <Block key={i} position={[5.32, 0.6, -4.8 + i * 0.75]} size={[0.075, 1.2, 0.075]} color={color} />)}
    {[0.27, 0.99].map((y) => <Block key={y} position={[5.32, y, -0.3]} size={[0.055, 0.05, 9]} color={color} />)}
    {Array.from({ length: 36 }, (_, i) => <Block key={i} position={[5.32, 0.63, -4.68 + i * 0.25]} size={[0.022, 0.72, 0.022]} color={color} />)}
    {/* Transparent picking surface makes fine rails comfortable to select. */}
    <mesh position={[5.32, 0.65, -0.3]}>
      <boxGeometry args={[0.15, 1.3, 9.3]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  </group>
}

function CameraRig({ view, reducedMotion }: { view: CameraView; reducedMotion: boolean }) {
  const { camera, size, invalidate } = useThree()
  const destination = useRef(new Vector3())
  const target = useRef(new Vector3(0, 0.6, -0.6))
  const activeTarget = useRef(new Vector3(0, 0.6, -0.6))
  const nextZoom = useRef(30)
  const initial = useRef(true)
  useEffect(() => {
    const narrow = size.width < 640
    destination.current.set(...(view === 'top' ? [0, 22, 0.001] : view === 'dock' ? [10, 7, 11] : [12, 11, 15]) as Point)
    target.current.set(0, view === 'dock' ? 1.1 : 0.6, view === 'dock' ? -1.3 : -0.6)
    nextZoom.current = Math.min(size.width / (view === 'dock' ? 15 : narrow ? 19.5 : 18.5), size.height / (view === 'dock' ? 11.6 : 13.8))
    if (initial.current || reducedMotion) {
      camera.position.copy(destination.current)
      activeTarget.current.copy(target.current)
      camera.lookAt(activeTarget.current)
      ;(camera as OrthographicCamera).zoom = nextZoom.current
      camera.updateProjectionMatrix()
      initial.current = false
    }
    invalidate()
  }, [view, reducedMotion, size.width, size.height, camera, invalidate])
  useFrame((_, delta) => {
    const ortho = camera as OrthographicCamera
    const moving = camera.position.distanceToSquared(destination.current) > 0.0001 || Math.abs(ortho.zoom - nextZoom.current) > 0.005 || activeTarget.current.distanceToSquared(target.current) > 0.0001
    if (!moving) return
    const factor = reducedMotion ? 1 : 1 - Math.exp(-9 * Math.min(delta, 0.1))
    camera.position.lerp(destination.current, factor)
    activeTarget.current.lerp(target.current, factor)
    ortho.zoom += (nextZoom.current - ortho.zoom) * factor
    camera.lookAt(activeTarget.current)
    camera.updateProjectionMatrix()
    invalidate()
  })
  return null
}

function ContextGuard({ onUnavailable }: { onUnavailable: () => void }) {
  const { gl } = useThree()
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onUnavailable() }
    const canvas = gl.domElement
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onUnavailable])
  return null
}

class SceneBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onUnavailable() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function DockScene(props: DockSceneProps) {
  return <div className="dock-scene" role="img" aria-label={`Illustrative loading facility. ${props.atDock ? 'Truck at dock.' : 'No truck at dock.'} ${props.held ? 'Fence highlighted for position uncertainty.' : ''} Selected: ${props.selected}. Use the scene controls to select objects or change the view.`}>
    <SceneBoundary onUnavailable={props.onUnavailable}>
      <Canvas orthographic camera={{ position: [12, 11, 15], zoom: 30, near: 0.1, far: 90 }} dpr={[1, 1.5]} frameloop="demand" shadows={{ type: PCFShadowMap }} gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }} fallback={<span>3D view unavailable.</span>}>
        <color attach="background" args={['#e9e7df']} />
        <ambientLight intensity={0.8} />
        <hemisphereLight args={['#fffaf0', '#87857e', 1.5]} />
        <directionalLight position={[-6, 12, 7]} intensity={3} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-camera-near={1} shadow-camera-far={35} shadow-bias={-0.0003} shadow-normalBias={0.025} shadow-radius={3} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]} receiveShadow>
          <planeGeometry args={[200, 200]} /><meshStandardMaterial color="#e9e7df" roughness={1} />
        </mesh>
        <Block position={[0, -0.16, -0.4]} size={[12.8, 0.3, 12.1]} color="#c8cec0" />
        <Block position={[-0.16, -0.005, 0.8]} size={[10.22, 0.035, 8.2]} color="#afb8a9" />
        {/* Expansion seams and bay guides are part of the miniature, not route evidence. */}
        {[-4.75, -1.58, 1.58, 4.75].map((x) => <Block key={x} position={[x, 0.02, 0.8]} size={[0.055, 0.018, 6.4]} color="#eceee3" />)}
        {[-0.7, 2.3, 4.1].map((z) => <Block key={z} position={[-0.15, 0.018, z]} size={[10.12, 0.008, 0.018]} color="#9ea894" />)}
        {[-3.12, 3.12].map((x) => <Block key={x} position={[x, 0.025, 3.95]} size={[2.6, 0.018, 0.055]} color="#eceee3" />)}
        <Block position={[-5.5, 0.075, -0.6]} size={[0.2, 0.15, 9.8]} color="#dddcd0" />
        {Array.from({ length: 10 }, (_, i) => <Block key={i} position={[-4.88 + i * 0.47, 0.025, 4.76]} size={[0.22, 0.019, 0.76]} color="#eceee3" />)}
        <Warehouse selected={props.selected === 'dock'} onSelect={props.onSelect} />
        {props.atDock && <Truck selected={props.selected === 'truck'} onSelect={props.onSelect} />}
        <Fence selected={props.selected === 'fence'} held={props.held} onSelect={props.onSelect} />
        {/* Three low bollards ground the entry edge without adding animated clutter. */}
        {[-4.3, -3.5, -2.7].map((x) => <group key={x} position={[x, 0, -1.65]}>
          <Block position={[0, 0.04, 0]} size={[0.24, 0.08, 0.24]} color="#6d776a" />
          <Block position={[0, 0.36, 0]} size={[0.12, 0.63, 0.12]} color="#d2b484" />
          <Block position={[0, 0.55, 0]} size={[0.13, 0.12, 0.13]} color={GRAPHITE} />
        </group>)}
        <CameraRig view={props.camera} reducedMotion={props.reducedMotion} />
        <ContextGuard onUnavailable={props.onUnavailable} />
      </Canvas>
    </SceneBoundary>
  </div>
}

