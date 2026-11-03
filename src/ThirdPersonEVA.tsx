import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { AstronautActivity, SimulationState } from './simulation'

type InteractionId = 'airlock' | 'service' | 'crater-ice' | 'ridge-rock' | 'thermal-probe' | 'rover'
type Position = { x: number; z: number }
type Props = {
  simulation: SimulationState
  running: boolean
  onActivity: (activity: AstronautActivity) => void
  onPosition: (position: Position, activity: AstronautActivity) => void
  onInteraction: (interaction: InteractionId) => boolean | void
  onResume: () => void
  onPause: () => void
  onOpenMap: () => void
}

const GRAVITY_MPS2 = 1.62
const FIXED_STEP_SECONDS = 1 / 60
const WALK_SPEED_MPS = 1.5
const RUN_SPEED_MPS = 2.5
const SPRINT_SPEED_MPS = 3.5
const JUMP_IMPULSE_MPS = 2.2
const MAX_SLOPE_DEGREES = 32
const WORLD_LIMIT_M = 65
const HABITAT = { x: -22, z: 0 }

const TARGETS: { id: InteractionId; label: string; x: number; z: number; color: number }[] = [
  { id: 'ridge-rock', label: 'Basaltic ridge · rock comparison', x: -7, z: 21, color: 0xb9c98b },
  { id: 'crater-ice', label: 'Crater rim · illumination survey', x: 6, z: 6, color: 0xe2c784 },
  { id: 'thermal-probe', label: 'Thermal target · subsurface probe', x: 28, z: -33, color: 0x9bb7ca },
]

type Obstacle = { x: number; z: number; radius: number; height: number }
const ROCKS: Obstacle[] = [
  { x: -8, z: -2, radius: 1.3, height: 1.5 }, { x: -3, z: -11, radius: 1.8, height: 1.1 },
  { x: 3, z: 17, radius: 1.2, height: 1.4 }, { x: 13, z: 16, radius: 2, height: 2.4 },
  { x: 31, z: 9, radius: 1.5, height: 1.2 }, { x: -19, z: -19, radius: 2.1, height: 1.9 },
  { x: 4, z: -24, radius: 1.4, height: 1.5 }, { x: 36, z: -23, radius: 2.1, height: 1.6 },
  { x: 41, z: 14, radius: 1.2, height: 1.1 }, { x: -31, z: 20, radius: 1.5, height: 1.4 },
  { x: -42, z: -10, radius: 2.4, height: 2.2 }, { x: 21, z: 31, radius: 1.7, height: 1.6 },
  { x: 45, z: 29, radius: 2, height: 2.5 }, { x: -42, z: 32, radius: 1.5, height: 1.2 },
]

function terrainHeight(x: number, z: number): number {
  const undulation = Math.sin(x * 0.065) * 0.55 + Math.cos(z * 0.08) * 0.42 + Math.sin((x + z) * 0.035) * 0.6
  const ridge = Math.max(0, 1 - Math.abs(z - (21 + Math.sin(x * 0.055) * 4)) / 9) * 2.8
  const craterDistance = Math.hypot(x - 20, z - 6)
  const bowl = craterDistance < 14 ? -Math.pow(1 - craterDistance / 14, 2) * 3.4 : 0
  const rim = craterDistance >= 11 && craterDistance < 17 ? Math.sin(((craterDistance - 11) / 6) * Math.PI) * 1.1 : 0
  return undulation + ridge + bowl + rim
}

function createAstronaut(): THREE.Group {
  const astronaut = new THREE.Group()
  const suitWhite = new THREE.MeshStandardMaterial({ color: 0xd8d9d0, roughness: 0.78, metalness: 0.05 })
  const trim = new THREE.MeshStandardMaterial({ color: 0x73826d, roughness: 0.62, metalness: 0.14 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x27302d, roughness: 0.8 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xc49b56, roughness: 0.23, metalness: 0.76 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x283c48, roughness: 0.15, metalness: 0.68, emissive: 0x18272b, emissiveIntensity: 0.22 })

  const addMesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, scale?: THREE.Vector3) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    if (scale) mesh.scale.copy(scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const capsule = (radius: number, length: number) => new THREE.CapsuleGeometry(radius, length, 5, 10)

  addMesh(astronaut, new THREE.BoxGeometry(0.7, 0.82, 0.42), suitWhite, new THREE.Vector3(0, 1.05, 0))
  addMesh(astronaut, new THREE.BoxGeometry(0.44, 0.66, 0.28), trim, new THREE.Vector3(0, 1.11, 0.34))
  addMesh(astronaut, new THREE.BoxGeometry(0.31, 0.38, 0.07), dark, new THREE.Vector3(0, 1.19, 0.5))
  addMesh(astronaut, new THREE.BoxGeometry(0.16, 0.09, 0.03), gold, new THREE.Vector3(0, 1.34, 0.55))
  addMesh(astronaut, new THREE.SphereGeometry(0.35, 20, 16), suitWhite, new THREE.Vector3(0, 1.72, 0))
  addMesh(astronaut, new THREE.SphereGeometry(0.29, 20, 12, 0, Math.PI * 2, 0.33, 1.4), glass, new THREE.Vector3(0, 1.73, -0.12))
  addMesh(astronaut, new THREE.TorusGeometry(0.345, 0.026, 8, 24), gold, new THREE.Vector3(0, 1.72, -0.02))

  const limbs: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(side * 0.43, 1.33, 0)
    astronaut.add(arm)
    addMesh(arm, capsule(0.13, 0.48), suitWhite, new THREE.Vector3(0, -0.31, 0))
    addMesh(arm, new THREE.SphereGeometry(0.14, 12, 10), trim, new THREE.Vector3(0, -0.59, 0))
    addMesh(arm, capsule(0.14, 0.16), suitWhite, new THREE.Vector3(0, -0.77, -0.015))
    for (let finger = 0; finger < 3; finger += 1) {
      addMesh(arm, new THREE.CapsuleGeometry(0.035, 0.08, 3, 5), suitWhite, new THREE.Vector3((finger - 1) * 0.06, -0.9, -0.02))
    }
    limbs.push(arm)

    const leg = new THREE.Group()
    leg.position.set(side * 0.21, 0.68, 0)
    astronaut.add(leg)
    addMesh(leg, capsule(0.17, 0.49), suitWhite, new THREE.Vector3(0, -0.3, 0))
    addMesh(leg, new THREE.SphereGeometry(0.15, 12, 10), trim, new THREE.Vector3(0, -0.59, 0))
    addMesh(leg, new THREE.BoxGeometry(0.29, 0.18, 0.43), dark, new THREE.Vector3(0, -0.76, -0.075))
    addMesh(leg, new THREE.BoxGeometry(0.3, 0.08, 0.45), suitWhite, new THREE.Vector3(0, -0.83, -0.075))
    limbs.push(leg)

    const shoulderPatch = addMesh(astronaut, new THREE.CircleGeometry(0.1, 16), gold, new THREE.Vector3(side * 0.43, 1.34, -0.08))
    shoulderPatch.rotation.y = Math.PI
  }
  astronaut.userData.limbs = limbs
  return astronaut
}

function addRock(scene: THREE.Scene, item: Obstacle, seed: number) {
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(item.radius, 1),
    new THREE.MeshStandardMaterial({ color: 0x77766d, roughness: 1, flatShading: true }),
  )
  rock.position.set(item.x, terrainHeight(item.x, item.z) + item.height / 2 - 0.3, item.z)
  rock.scale.set(1, item.height / item.radius, 0.82 + (seed % 4) * 0.08)
  rock.rotation.set(seed * 0.13, seed * 0.73, seed * 0.29)
  rock.castShadow = true
  rock.receiveShadow = true
  scene.add(rock)
}

function buildWorld(scene: THREE.Scene): { astronaut: THREE.Group; markerGroups: Map<InteractionId, THREE.Group> } {
  scene.background = new THREE.Color(0x101a24)
  scene.fog = new THREE.Fog(0x101a24, 105, 220)
  const ambient = new THREE.HemisphereLight(0xb7c6d1, 0x403d35, 1.6)
  scene.add(ambient)
  const sunlight = new THREE.DirectionalLight(0xffe6ba, 3.2)
  sunlight.position.set(-45, 70, 30)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(2048, 2048)
  sunlight.shadow.camera.left = -80
  sunlight.shadow.camera.right = 80
  sunlight.shadow.camera.top = 80
  sunlight.shadow.camera.bottom = -80
  sunlight.shadow.bias = -0.0004
  scene.add(sunlight)

  const terrainGeometry = new THREE.BufferGeometry()
  const divisions = 145
  const extent = 75
  const positions: number[] = []
  const indices: number[] = []
  for (let row = 0; row <= divisions; row += 1) {
    for (let column = 0; column <= divisions; column += 1) {
      const x = (column / divisions - 0.5) * extent * 2
      const z = (row / divisions - 0.5) * extent * 2
      positions.push(x, terrainHeight(x, z), z)
      if (row < divisions && column < divisions) {
        const index = row * (divisions + 1) + column
        indices.push(index, index + divisions + 1, index + 1, index + 1, index + divisions + 1, index + divisions + 2)
      }
    }
  }
  terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  terrainGeometry.setIndex(indices)
  terrainGeometry.computeVertexNormals()
  const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({ color: 0x77766e, roughness: 1, metalness: 0, vertexColors: false }),
  )
  terrain.receiveShadow = true
  scene.add(terrain)

  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(245, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x171f28, side: THREE.BackSide }),
  )
  horizon.position.y = -4
  scene.add(horizon)

  const starPositions = new Float32Array(500 * 3)
  for (let index = 0; index < 500; index += 1) {
    starPositions[index * 3] = Math.sin(index * 92.371) * 180
    starPositions[index * 3 + 1] = 18 + (Math.abs(Math.cos(index * 17.123)) * 110)
    starPositions[index * 3 + 2] = Math.cos(index * 31.765) * 180
  }
  const starsGeometry = new THREE.BufferGeometry()
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xd9e2ec, size: 0.48, sizeAttenuation: false })))
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 24, 20),
    new THREE.MeshStandardMaterial({ color: 0x3e84a7, emissive: 0x103044, roughness: 0.65 }),
  )
  earth.position.set(44, 37, -96)
  scene.add(earth)
  const earthCloud = new THREE.Mesh(new THREE.SphereGeometry(2.48, 20, 16), new THREE.MeshBasicMaterial({ color: 0xa2c8ca, wireframe: true, transparent: true, opacity: 0.22 }))
  earthCloud.position.copy(earth.position)
  scene.add(earthCloud)

  for (let index = 0; index < ROCKS.length; index += 1) addRock(scene, ROCKS[index], index + 1)

  const habitat = new THREE.Group()
  habitat.position.set(HABITAT.x, terrainHeight(HABITAT.x, HABITAT.z), HABITAT.z)
  scene.add(habitat)
  const habitatMat = new THREE.MeshStandardMaterial({ color: 0xb7b8ac, roughness: 0.75, metalness: 0.12, side: THREE.DoubleSide })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x878d82, roughness: 0.9 })
  const limeMat = new THREE.MeshStandardMaterial({ color: 0xc5e67b, emissive: 0x34421c, emissiveIntensity: 0.4 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.25, 10.2), wallMat)
  floor.position.set(0, 0.08, 0)
  floor.receiveShadow = true
  habitat.add(floor)
  const wall = (x: number, z: number, width: number, depth: number) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(width, 3.4, depth), habitatMat)
    part.position.set(x, 1.8, z)
    part.castShadow = true
    part.receiveShadow = true
    habitat.add(part)
  }
  wall(-5, 0, 0.35, 10)
  wall(5, 0, 0.35, 10)
  wall(0, 5, 10, 0.35)
  wall(-3.9, -5, 2.2, 0.32)
  wall(3.9, -5, 2.2, 0.32)
  const header = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.4, 0.4), habitatMat)
  header.position.set(0, 3.25, -5)
  habitat.add(header)
  const airlock = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.7, 0.35), new THREE.MeshStandardMaterial({ color: 0x38423b, roughness: 0.65, metalness: 0.4 }))
  airlock.position.set(0, 1.45, -5.15)
  habitat.add(airlock)
  const hatchLight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.08), limeMat)
  hatchLight.position.set(1.3, 2.2, -5.35)
  habitat.add(hatchLight)
  const console = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.1, 0.35), darkenMat(0x37423b))
  console.position.set(-4.15, 0.75, 0.1)
  habitat.add(console)
  const consoleScreen = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.08), limeMat)
  consoleScreen.position.set(-4.15, 1.16, -0.12)
  habitat.add(consoleScreen)
  const solar = new THREE.Group()
  solar.position.set(-14, terrainHeight(-14, 3), 3)
  solar.rotation.y = 0.25
  scene.add(solar)
  const solarBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.8, 10), wallMat)
  solarBase.position.y = 0.9
  solar.add(solarBase)
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.07, 2.3), new THREE.MeshStandardMaterial({ color: 0x25394a, roughness: 0.35, metalness: 0.6, emissive: 0x102536, emissiveIntensity: 0.2 }))
    panel.position.set(side * 2, 1.65, 0)
    panel.rotation.x = -0.16
    panel.castShadow = true
    solar.add(panel)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.11, 0.1), goldMat())
    frame.position.set(side * 2, 1.65, 1.16)
    solar.add(frame)
  }

  const rover = new THREE.Group()
  rover.position.set(-10, terrainHeight(-10, 7), 7)
  scene.add(rover)
  const roverBody = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 2.15), new THREE.MeshStandardMaterial({ color: 0xaeb49b, roughness: 0.7, metalness: 0.2 }))
  roverBody.position.y = 1.35
  rover.add(roverBody)
  const roverDeck = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.8, 1.3), wallMat)
  roverDeck.position.set(0, 2.12, -0.08)
  rover.add(roverDeck)
  for (const side of [-1, 1]) {
    for (const axle of [-0.78, 0, 0.78]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.23, 12), darkenMat(0x282e2b))
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(side * 1.76, 0.72, axle)
      rover.add(wheel)
    }
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), goldMat())
  antenna.position.set(0.35, 2.9, 0.1)
  rover.add(antenna)

  const markerGroups = new Map<InteractionId, THREE.Group>()
  for (const target of TARGETS) {
    const group = new THREE.Group()
    group.position.set(target.x, terrainHeight(target.x, target.z), target.z)
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.9, 8), darkenMat(0x363e36))
    beacon.position.y = 0.45
    group.add(beacon)
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshStandardMaterial({ color: target.color, emissive: target.color, emissiveIntensity: 0.65, roughness: 0.35 }),
    )
    light.position.y = 1
    group.add(light)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.035, 7, 24), new THREE.MeshBasicMaterial({ color: target.color, transparent: true, opacity: 0.58 }))
    halo.rotation.x = Math.PI / 2
    halo.position.y = 0.05
    group.add(halo)
    scene.add(group)
    markerGroups.set(target.id, group)
  }
  const airlockMarker = interactionMarker(0xc5e67b)
  airlockMarker.position.set(HABITAT.x, terrainHeight(HABITAT.x, HABITAT.z), -5.2)
  scene.add(airlockMarker)
  markerGroups.set('airlock', airlockMarker)
  const serviceMarker = interactionMarker(0x79bfd1)
  serviceMarker.position.set(HABITAT.x - 4.1, terrainHeight(HABITAT.x - 4.1, 0), 0.1)
  scene.add(serviceMarker)
  markerGroups.set('service', serviceMarker)
  const roverMarker = interactionMarker(0xd2a969)
  roverMarker.position.set(-10, terrainHeight(-10, 7), 7)
  scene.add(roverMarker)
  markerGroups.set('rover', roverMarker)

  const astronaut = createAstronaut()
  scene.add(astronaut)
  return { astronaut, markerGroups }
}

function darkenMat(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.12 })
}

function goldMat() {
  return new THREE.MeshStandardMaterial({ color: 0xa88e5b, roughness: 0.55, metalness: 0.62 })
}

function interactionMarker(color: number) {
  const group = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 7, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78 }))
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.06
  group.add(ring)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.35, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 }))
  stem.position.y = 0.72
  group.add(stem)
  return group
}

function slopeDegrees(x: number, z: number): number {
  const dx = terrainHeight(x + 0.5, z) - terrainHeight(x - 0.5, z)
  const dz = terrainHeight(x, z + 0.5) - terrainHeight(x, z - 0.5)
  return THREE.MathUtils.radToDeg(Math.atan(Math.hypot(dx, dz)))
}

function dampAngle(current: number, target: number, smoothing: number, dt: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + difference * (1 - Math.exp(-smoothing * dt))
}

export default function ThirdPersonEVA({
  simulation,
  running,
  onActivity,
  onPosition,
  onInteraction,
  onResume,
  onPause,
  onOpenMap,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simulationRef = useRef(simulation)
  const callbacksRef = useRef({ onActivity, onPosition, onInteraction, onPause, onOpenMap })
  const runningRef = useRef(running)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [pointerLocked, setPointerLocked] = useState(false)
  const [lastFeedback, setLastFeedback] = useState('')
  const [lowHud, setLowHud] = useState(false)
  const overlayOpenRef = useRef(false)

  useEffect(() => { simulationRef.current = simulation }, [simulation])
  useEffect(() => {
    callbacksRef.current = { onActivity, onPosition, onInteraction, onPause, onOpenMap }
  }, [onActivity, onPosition, onInteraction, onPause, onOpenMap])
  useEffect(() => { runningRef.current = running }, [running])
  useEffect(() => { overlayOpenRef.current = inventoryOpen || mapOpen }, [inventoryOpen, mapOpen])
  useEffect(() => {
    if ((!running || inventoryOpen || mapOpen) && document.pointerLockElement) document.exitPointerLock()
  }, [running, inventoryOpen, mapOpen])

  useEffect(() => {
    const mount = mountRef.current
    const canvas = canvasRef.current
    if (!mount || !canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    } catch (error) {
      console.error('Unable to initialize the WebGL lunar scene.', error)
      window.setTimeout(() => setLastFeedback('3D rendering is unavailable in this browser. Check WebGL support and reload.'), 0)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
    renderer.setSize(mount.clientWidth, mount.clientHeight, false)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(59, mount.clientWidth / mount.clientHeight, 0.08, 320)
    const world = buildWorld(scene)
    const astronaut = world.astronaut
    const velocity = new THREE.Vector3()
    const cameraTarget = new THREE.Vector3()
    const desiredCamera = new THREE.Vector3()
    const keys = new Set<string>()
    const pointer = { yaw: 0, pitch: 0.12, sensitivity: 0.0021, distance: 6.2, shoulder: 0.42, draggingCamera: false, lastX: 0, lastY: 0 }
    const character = {
      x: simulationRef.current.astronautX,
      z: simulationRef.current.astronautZ,
      footY: simulationRef.current.inHabitat
        ? terrainHeight(HABITAT.x, HABITAT.z) + 0.23
        : terrainHeight(simulationRef.current.astronautX, simulationRef.current.astronautZ),
      yVelocity: 0,
      grounded: true,
      crouching: false,
      lastGrounded: true,
      landingUntil: 0,
      inside: simulationRef.current.inHabitat,
      activity: 'resting' as AstronautActivity,
      moveBlend: 0,
      frameAccumulator: 0,
      positionPublish: 0,
      interactionCooldown: 0,
    }
    astronaut.position.set(character.x, character.footY, character.z)
    let animationFrame = 0
    let pointerLocked = false
    let lastSimulationInHabitat = simulationRef.current.inHabitat
    let lastSimulationElapsed = simulationRef.current.elapsedSeconds
    let lastFrameTime = performance.now()
    const targetFromState = new THREE.Vector3()

    const resizeObserver = new ResizeObserver(() => {
      if (!mount.clientWidth || !mount.clientHeight) return
      renderer.setSize(mount.clientWidth, mount.clientHeight, false)
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(mount)

    const setActivity = (activity: AstronautActivity) => {
      if (character.activity === activity) return
      character.activity = activity
      callbacksRef.current.onActivity(activity)
    }

    const nearestInteraction = (): { id: InteractionId; label: string; distance: number } | null => {
      if (character.inside) {
        const consoleDistance = Math.hypot(character.x - (HABITAT.x - 4.1), character.z - 0.1)
        const doorDistance = Math.hypot(character.x - HABITAT.x, character.z + 5.2)
        if (doorDistance < 2.4 && doorDistance < consoleDistance) return { id: 'airlock', label: 'Use airlock', distance: doorDistance }
        if (consoleDistance < 2.1) return { id: 'service', label: simulationRef.current.suitServiceActive ? 'Stop suit service' : 'Service suit · transfer habitat resources', distance: consoleDistance }
        return null
      }
      const doorDistance = Math.hypot(character.x - HABITAT.x, character.z + 5.2)
      if (doorDistance < 2.4) return { id: 'airlock', label: 'Enter habitat airlock', distance: doorDistance }
      let nearest: { id: InteractionId; label: string; distance: number } | null = null
      for (const target of TARGETS) {
        const distance = Math.hypot(character.x - target.x, character.z - target.z)
        if (distance < 2.4 && (!nearest || distance < nearest.distance)) {
          nearest = { id: target.id, label: `Collect ${target.label}`, distance }
        }
      }
      const roverDistance = Math.hypot(character.x + 10, character.z - 7)
      if (roverDistance < 2.1 && (!nearest || roverDistance < nearest.distance)) {
        nearest = { id: 'rover', label: 'Inspect rover · vehicle access', distance: roverDistance }
      }
      return nearest
    }

    const interact = () => {
      const interaction = nearestInteraction()
      if (!interaction) {
        setLastFeedback('No equipment or airlock is within reach.')
        return
      }
      if (interaction.id === 'airlock') {
        if (character.inside) {
          const current = simulationRef.current
          if (current.suitOxygenKg < 1.2 || current.suitBatteryWh < 1_200 || current.suitIntegrity < 40) {
            setLastFeedback('Airlock interlock: service the suit and verify reserves before exit.')
            return
          }
          if (callbacksRef.current.onInteraction('airlock') === false) return
          character.inside = false
          character.z = -7.2
          character.x = HABITAT.x
          character.footY = terrainHeight(character.x, character.z)
          character.grounded = true
          setLastFeedback('Airlock cycle complete · EVA started')
        } else {
          if (callbacksRef.current.onInteraction('airlock') === false) return
          character.inside = true
          character.x = HABITAT.x
          character.z = -1
          character.footY = terrainHeight(HABITAT.x, HABITAT.z) + 0.23
          character.grounded = true
          velocity.set(0, 0, 0)
          setLastFeedback('Airlock cycle complete · crew returned to habitat')
        }
        return
      }
      if (callbacksRef.current.onInteraction(interaction.id) === false) return
      setLastFeedback(interaction.label)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat && ['e', 'E', 'Escape', 'Tab', 'm', 'M', ' '].includes(event.key)) return
      const target = event.target
      if (target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return
      const key = event.key.toLowerCase()
      if (overlayOpenRef.current && !['escape', 'tab', 'm'].includes(key)) return
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'control', 'c', ' '].includes(key)) {
        keys.add(key)
        event.preventDefault()
      }
      if (key === 'e') { event.preventDefault(); interact() }
      if (key === 'escape') {
        setInventoryOpen(false)
        setMapOpen(false)
        if (pointerLocked) document.exitPointerLock()
        callbacksRef.current.onPause()
      }
      if (key === 'tab') {
        event.preventDefault()
        setInventoryOpen((value) => !value)
      }
      if (key === 'm') setMapOpen((value) => !value)
      if (key === 'q') pointer.shoulder *= -1
    }
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase())
    const onBlur = () => {
      keys.clear()
      pointer.draggingCamera = false
    }
    const onMouseMove = (event: MouseEvent) => {
      if (pointerLocked) {
        pointer.yaw -= event.movementX * pointer.sensitivity
        pointer.pitch = THREE.MathUtils.clamp(pointer.pitch - event.movementY * pointer.sensitivity, -0.36, 0.62)
      } else if (pointer.draggingCamera) {
        pointer.yaw -= (event.clientX - pointer.lastX) * pointer.sensitivity
        pointer.pitch = THREE.MathUtils.clamp(pointer.pitch - (event.clientY - pointer.lastY) * pointer.sensitivity, -0.36, 0.62)
        pointer.lastX = event.clientX
        pointer.lastY = event.clientY
      }
    }
    const onPointerLockChange = () => {
      pointerLocked = document.pointerLockElement === canvas
      setPointerLocked(pointerLocked)
      if (!pointerLocked) keys.clear()
    }
    const onWheel = (event: WheelEvent) => {
      pointer.distance = THREE.MathUtils.clamp(pointer.distance + event.deltaY * 0.006, 3.4, 9.5)
    }
    const onCanvasMouseDown = (event: MouseEvent) => {
      if (!runningRef.current || event.button !== 0) return
      pointer.draggingCamera = true
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      canvas.focus()
    }
    const onMouseUp = () => { pointer.draggingCamera = false }
    const onCanvasClick = () => {
      canvas.focus()
      if (!runningRef.current || !canvas.requestPointerLock) return
      try {
        const request = canvas.requestPointerLock()
        if (request) {
          void request.catch((error: unknown) => {
            console.warn('Pointer lock was denied; drag the scene to look around.', error)
            setLastFeedback('Pointer lock unavailable · drag the scene to look around')
          })
        }
      } catch (error) {
        console.warn('Pointer lock was denied; drag the scene to look around.', error)
        setLastFeedback('Pointer lock unavailable · drag the scene to look around')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    canvas.addEventListener('wheel', onWheel, { passive: true })
    canvas.addEventListener('click', onCanvasClick)
    canvas.addEventListener('mousedown', onCanvasMouseDown)

    const publishPose = (force = false) => {
      if (!force && character.positionPublish < 0.18) return
      character.positionPublish = 0
      callbacksRef.current.onPosition({ x: character.x, z: character.z }, character.activity)
    }

    const collide = (x: number, z: number): { x: number; z: number } => {
      let resolvedX = THREE.MathUtils.clamp(x, -WORLD_LIMIT_M, WORLD_LIMIT_M)
      let resolvedZ = THREE.MathUtils.clamp(z, -WORLD_LIMIT_M, WORLD_LIMIT_M)
      if (character.inside) {
        resolvedX = THREE.MathUtils.clamp(resolvedX, HABITAT.x - 4.25, HABITAT.x + 4.25)
        resolvedZ = THREE.MathUtils.clamp(resolvedZ, -4.55, 4.35)
        return { x: resolvedX, z: resolvedZ }
      }
      if (slopeDegrees(resolvedX, resolvedZ) > MAX_SLOPE_DEGREES && terrainHeight(resolvedX, resolvedZ) > terrainHeight(character.x, character.z) + 0.1) {
        return { x: character.x, z: character.z }
      }
      for (const rock of ROCKS) {
        if (Math.abs(terrainHeight(resolvedX, resolvedZ) - terrainHeight(rock.x, rock.z)) > rock.height + 1.2) continue
        const dx = resolvedX - rock.x
        const dz = resolvedZ - rock.z
        const minDistance = rock.radius * 0.88 + 0.42
        const distance = Math.hypot(dx, dz)
        if (distance < minDistance) {
          const scale = minDistance / Math.max(distance, 0.001)
          resolvedX = rock.x + dx * scale
          resolvedZ = rock.z + dz * scale
        }
      }
      if (resolvedX > HABITAT.x - 5.4 && resolvedX < HABITAT.x + 5.4 && resolvedZ > -5.3 && resolvedZ < 5.3) {
        const inDoorway = Math.abs(resolvedX - HABITAT.x) < 1.15 && resolvedZ < -4.55
        if (!inDoorway) {
          if (Math.abs(resolvedX - character.x) > Math.abs(resolvedZ - character.z)) resolvedX = character.x
          else resolvedZ = character.z < -5.2 ? -5.35 : 5.35
        }
      }
      return { x: resolvedX, z: resolvedZ }
    }

    const fixedUpdate = (dt: number, elapsed: number) => {
      const currentSimulation = simulationRef.current
      const positionDelta = Math.hypot(character.x - currentSimulation.astronautX, character.z - currentSimulation.astronautZ)
      const simulationRewound = currentSimulation.elapsedSeconds < lastSimulationElapsed
      lastSimulationElapsed = currentSimulation.elapsedSeconds
      if (currentSimulation.inHabitat !== lastSimulationInHabitat || positionDelta > 6 || simulationRewound) {
        character.inside = currentSimulation.inHabitat
        character.x = currentSimulation.astronautX
        character.z = currentSimulation.astronautZ
        character.yVelocity = 0
        character.footY = character.inside
          ? terrainHeight(HABITAT.x, HABITAT.z) + 0.23
          : terrainHeight(character.x, character.z)
        character.grounded = true
        velocity.set(0, 0, 0)
        lastSimulationInHabitat = currentSimulation.inHabitat
      }
      const movementAllowed = runningRef.current && (character.inside || currentSimulation.evaActive)
      const forwardInput = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
      const sideInput = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0)
      const inputLength = Math.hypot(forwardInput, sideInput)
      const normalizedForward = inputLength > 0 ? forwardInput / inputLength : 0
      const normalizedSide = inputLength > 0 ? sideInput / inputLength : 0
      const sprinting = keys.has('shift') && forwardInput > 0
      character.crouching = keys.has('c') || keys.has('control')
      const targetSpeed = !movementAllowed ? 0
        : character.crouching ? 0.85
          : sprinting ? SPRINT_SPEED_MPS
            : keys.has('control') ? RUN_SPEED_MPS
              : WALK_SPEED_MPS
      const angle = pointer.yaw
      const forwardX = Math.sin(angle)
      const forwardZ = -Math.cos(angle)
      const rightX = Math.cos(angle)
      const rightZ = Math.sin(angle)
      const targetX = (forwardX * normalizedForward + rightX * normalizedSide) * targetSpeed
      const targetZ = (forwardZ * normalizedForward + rightZ * normalizedSide) * targetSpeed
      const acceleration = character.grounded ? 5.4 : 1.1
      velocity.x = THREE.MathUtils.damp(velocity.x, targetX, acceleration, dt)
      velocity.z = THREE.MathUtils.damp(velocity.z, targetZ, acceleration, dt)
      if (!movementAllowed) {
        velocity.x = THREE.MathUtils.damp(velocity.x, 0, 8, dt)
        velocity.z = THREE.MathUtils.damp(velocity.z, 0, 8, dt)
      }
      if (keys.has(' ') && character.grounded && movementAllowed) {
        character.yVelocity = JUMP_IMPULSE_MPS
        character.grounded = false
        setActivity('jumping')
        setLastFeedback(`Jump impulse ${JUMP_IMPULSE_MPS.toFixed(1)} m/s · lunar gravity ${GRAVITY_MPS2} m/s²`)
      }
      const proposed = collide(character.x + velocity.x * dt, character.z + velocity.z * dt)
      character.x = proposed.x
      character.z = proposed.z
      const groundY = character.inside
        ? terrainHeight(HABITAT.x, HABITAT.z) + 0.23
        : terrainHeight(character.x, character.z)
      if (runningRef.current) character.yVelocity -= GRAVITY_MPS2 * dt
      else character.yVelocity = 0
      const nextFootY = character.footY + (runningRef.current ? character.yVelocity * dt : 0)
      if (nextFootY <= groundY) {
        const impactSpeed = Math.abs(character.yVelocity)
        character.yVelocity = 0
        character.grounded = true
        if (!character.lastGrounded && impactSpeed > 1.1) {
          character.landingUntil = elapsed + 0.35
          setLastFeedback(`Landing · ${impactSpeed.toFixed(1)} m/s vertical impact speed`)
        }
      } else {
        character.grounded = false
      }
      character.lastGrounded = character.grounded
      const nextY = character.grounded ? groundY : Math.max(groundY, nextFootY)
      character.footY = nextY
      const moving = Math.hypot(velocity.x, velocity.z) > 0.15
      if (character.grounded && elapsed < character.landingUntil) setActivity('landing')
      else if (!character.grounded) setActivity(character.yVelocity > 0 ? 'jumping' : 'falling')
      else if (!movementAllowed) setActivity('resting')
      else if (!moving) setActivity(character.inside ? 'resting' : 'resting')
      else if (sprinting && moving) setActivity('sprinting')
      else if (keys.has('control') && moving) setActivity('running')
      else setActivity('walking')

      const moveAmount = Math.min(1, Math.hypot(velocity.x, velocity.z) / SPRINT_SPEED_MPS)
      character.moveBlend = THREE.MathUtils.damp(character.moveBlend, moveAmount, 6, dt)
      const limbs = astronaut.userData.limbs as THREE.Group[]
      const gaitSpeed = sprinting ? 9 : 6
      const gait = Math.sin(elapsed * gaitSpeed) * character.moveBlend
      limbs[0].rotation.x = -gait * 0.62
      limbs[1].rotation.x = gait * 0.62
      limbs[2].rotation.x = gait * 0.88
      limbs[3].rotation.x = -gait * 0.88
      astronaut.rotation.y = dampAngle(astronaut.rotation.y, Math.atan2(velocity.x, -velocity.z) || pointer.yaw, moving ? 8 : 2, dt)
      if (!moving && !character.inside) astronaut.rotation.y = dampAngle(astronaut.rotation.y, pointer.yaw, 3.5, dt)
      astronaut.position.set(character.x, character.footY + (character.grounded ? Math.abs(gait) * 0.014 : 0), character.z)
      character.positionPublish += dt
      character.interactionCooldown = Math.max(0, character.interactionCooldown - dt)
      publishPose()
    }

    const animate = (timestamp: number) => {
      animationFrame = requestAnimationFrame(animate)
      const dt = Math.min(Math.max(0, (timestamp - lastFrameTime) / 1_000), 0.05)
      lastFrameTime = timestamp
      const now = performance.now() / 1_000
      character.frameAccumulator += dt
      while (character.frameAccumulator >= FIXED_STEP_SECONDS) {
        fixedUpdate(FIXED_STEP_SECONDS, now)
        character.frameAccumulator -= FIXED_STEP_SECONDS
      }

      const activity = simulationRef.current.activityMode
      const baseYaw = pointer.yaw
      const forward = new THREE.Vector3(Math.sin(baseYaw), 0, -Math.cos(baseYaw))
      const cameraUp = 2.8 + pointer.pitch * 2.2
      const shoulder = new THREE.Vector3(Math.cos(baseYaw) * pointer.shoulder, 0, Math.sin(baseYaw) * pointer.shoulder)
      targetFromState.set(character.x, astronaut.position.y + 1.35, character.z)
      cameraTarget.copy(targetFromState)
      desiredCamera.copy(targetFromState).addScaledVector(forward, -pointer.distance).add(shoulder)
      desiredCamera.y += cameraUp
      let safeDistance = pointer.distance
      for (let sample = 1; sample <= 12; sample += 1) {
        const alpha = sample / 12
        const sx = THREE.MathUtils.lerp(targetFromState.x, desiredCamera.x, alpha)
        const sz = THREE.MathUtils.lerp(targetFromState.z, desiredCamera.z, alpha)
        const sy = THREE.MathUtils.lerp(targetFromState.y, desiredCamera.y, alpha)
        if (sy < terrainHeight(sx, sz) + 0.45) {
          safeDistance = Math.max(2.3, pointer.distance * alpha - 0.4)
          break
        }
      }
      if (safeDistance < pointer.distance) {
        desiredCamera.copy(targetFromState).addScaledVector(forward, -safeDistance).add(shoulder)
        desiredCamera.y += cameraUp * (safeDistance / pointer.distance)
      }
      camera.position.lerp(desiredCamera, 1 - Math.exp(-10 * dt))
      camera.lookAt(cameraTarget)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.geometry instanceof THREE.TorusGeometry && object.parent?.userData.interaction) {
          object.rotation.z += dt * 0.3
        }
      })
      if (activity === 'sprinting') astronaut.rotation.z = THREE.MathUtils.damp(astronaut.rotation.z, -0.035, 4, dt)
      else astronaut.rotation.z = THREE.MathUtils.damp(astronaut.rotation.z, 0, 5, dt)
      renderer.render(scene, camera)
    }
    animate(performance.now())

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('click', onCanvasClick)
      canvas.removeEventListener('mousedown', onCanvasMouseDown)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) material.dispose()
        }
      })
      renderer.dispose()
    }
  }, [])

  const interaction = (() => {
    if (simulation.inHabitat) {
      const consoleDistance = Math.hypot(simulation.astronautX - (HABITAT.x - 4.1), simulation.astronautZ - 0.1)
      const doorDistance = Math.hypot(simulation.astronautX - HABITAT.x, simulation.astronautZ + 5.2)
      if (doorDistance < 2.4 && doorDistance < consoleDistance) return 'Use airlock · E'
      if (consoleDistance < 2.1) return `${simulation.suitServiceActive ? 'Stop suit service' : 'Service suit from habitat stores'} · E`
      return 'Move to the airlock or service terminal'
    }
    const doorDistance = Math.hypot(simulation.astronautX - HABITAT.x, simulation.astronautZ + 5.2)
    if (doorDistance < 2.4) return 'Enter habitat · E'
    for (const target of TARGETS) {
      if (Math.hypot(simulation.astronautX - target.x, simulation.astronautZ - target.z) < 2.4) return `${target.label} · E`
    }
    if (Math.hypot(simulation.astronautX + 10, simulation.astronautZ - 7) < 2.1) return 'Inspect rover · E'
    return ''
  })()

  const oxygenPercent = Math.min(100, Math.max(0, (simulation.suitOxygenKg / 5.4) * 100))
  const batteryPercent = Math.min(100, Math.max(0, (simulation.suitBatteryWh / 5_600) * 100))
  const workload: Record<AstronautActivity, number> = {
    resting: 1, walking: 1.5, running: 2.2, sprinting: 3, jumping: 2.6, falling: 1.2, landing: 2, working: 3.5,
  }
  const oxygenRateKgPerHour = simulation.evaActive ? 0.0000097 * workload[simulation.activityMode] * 3_600 : 0
  const distanceToHabitat = Math.hypot(simulation.astronautX - HABITAT.x, simulation.astronautZ)
  const temperatureC = simulation.suitTemperatureK - 273.15
  const co2Percent = Math.min(100, (simulation.suitCo2Kg / 0.02) * 100)

  return (
    <div className="thirdperson-stage" ref={mountRef}>
      <canvas aria-label="Playable third-person lunar landscape. Click to lock the mouse and look around." className="thirdperson-canvas" ref={canvasRef} tabIndex={0} />
      <div className="tp-top-left"><span className="tp-live"><i /> {simulation.inHabitat ? 'HABITAT INTERIOR' : simulation.evaActive ? 'EVA SURFACE OPERATIONS' : 'AIRLOCK STAGING'}</span><small>{simulation.site === 'polar' ? 'POLAR RIDGE SCENARIO' : simulation.site === 'lowland' ? 'LOW-LATITUDE SCENARIO' : 'TRAINING SITE SCENARIO'} · SYNTHETIC TERRAIN</small></div>
      <div className="tp-top-right"><span>{simulation.activityMode.toUpperCase()}</span><strong>{simulation.activityMode === 'sprinting' ? 'SPRINT' : simulation.activityMode === 'jumping' ? 'ASCENDING' : simulation.activityMode === 'falling' ? 'DESCENDING' : simulation.activityMode === 'landing' ? 'LANDING' : simulation.activityMode === 'resting' ? 'STANDING' : simulation.activityMode}</strong><small>g = {GRAVITY_MPS2.toFixed(2)} m/s² · {Math.round(distanceToHabitat)} m to habitat</small></div>

      <div className="tp-hud-left">
        <div className={`tp-resource oxygen ${oxygenPercent < 25 ? 'critical' : ''}`}>
          <div className="tp-resource-title"><span>O₂ SUIT RESERVE</span><strong>{simulation.suitOxygenKg.toFixed(2)} kg</strong></div>
          <div className="tp-meter"><i style={{ width: `${oxygenPercent}%` }} /></div>
          <small>{oxygenPercent.toFixed(0)}% · {oxygenRateKgPerHour.toFixed(3)} kg/h at current workload</small>
          {oxygenPercent < 25 && <b>LOW OXYGEN · RETURN TO AIRLOCK</b>}
        </div>
        <div className="tp-resource">
          <div className="tp-resource-title"><span>SUIT BATTERY</span><strong>{simulation.suitBatteryWh.toFixed(0)} Wh</strong></div>
          <div className="tp-meter battery"><i style={{ width: `${batteryPercent}%` }} /></div>
          <small>{batteryPercent.toFixed(0)}% · cooling + comms + sensors</small>
        </div>
        {!lowHud && <div className="tp-secondary">
          <div><span>SUIT TEMP</span><strong>{temperatureC.toFixed(1)} °C</strong></div>
          <div><span>SUIT CO₂</span><strong>{(co2Percent).toFixed(1)}% capacity</strong></div>
          <div><span>HYDRATION</span><strong>{((simulation.suitWaterKg / 2.4) * 100).toFixed(0)}%</strong></div>
          <div><span>FATIGUE</span><strong>{Math.min(100, simulation.fatigue).toFixed(0)}%</strong></div>
        </div>}
      </div>

      <div className="tp-bottom-left">
        {interaction && <div className="tp-interact"><kbd>E</kbd><span>{interaction}</span></div>}
        {lastFeedback && <div className="tp-feedback" role="status">{lastFeedback}</div>}
      </div>
      <div className="tp-bottom-right"><span className="tp-aim">+</span><span>{pointerLocked ? 'MOUSE LOOK ACTIVE' : 'CLICK SCENE · MOUSE LOOK'}</span></div>

      <div className="tp-control-hints"><kbd>W A S D</kbd> MOVE <kbd>CTRL</kbd> RUN <kbd>SHIFT</kbd> SPRINT <kbd>C</kbd> CROUCH <kbd>SPACE</kbd> JUMP <kbd>E</kbd> INTERACT <kbd>Q</kbd> SHOULDER</div>
      <div className="tp-actions">
        <button onClick={() => setLowHud((value) => !value)} type="button">{lowHud ? 'HUD +' : 'HUD −'}</button>
        <button onClick={() => setInventoryOpen((value) => !value)} type="button">Inventory · Tab</button>
        <button onClick={() => { setMapOpen((value) => !value); onOpenMap() }} type="button">Map · M</button>
        <button onClick={onPause} type="button">Pause · Esc</button>
      </div>

      {inventoryOpen && <div className="tp-modal"><div className="tp-modal-card"><button className="tp-close" onClick={() => setInventoryOpen(false)} type="button">×</button><span className="tp-modal-kicker">SUIT & SURVIVAL INVENTORY</span><h3>Expedition resources</h3><div className="tp-inventory-grid"><div><small>SUIT OXYGEN</small><strong>{simulation.suitOxygenKg.toFixed(2)} kg</strong></div><div><small>SUIT WATER</small><strong>{simulation.suitWaterKg.toFixed(2)} kg</strong></div><div><small>SUIT BATTERY</small><strong>{simulation.suitBatteryWh.toFixed(0)} Wh</strong></div><div><small>HABITAT OXYGEN</small><strong>{simulation.oxygenKg.toFixed(2)} kg</strong></div><div><small>HABITAT WATER</small><strong>{simulation.waterKg.toFixed(2)} kg</strong></div><div><small>HABITAT POWER</small><strong>{(simulation.batteryWh / 1000).toFixed(1)} kWh</strong></div></div><p>Suit resupply occurs only at the habitat service terminal while it has available stores and electrical power.</p></div></div>}
      {mapOpen && <div className="tp-modal"><div className="tp-modal-card"><button className="tp-close" onClick={() => setMapOpen(false)} type="button">×</button><span className="tp-modal-kicker">LOCAL NAVIGATION · SYNTHETIC</span><h3>Surface waypoints</h3><div className="tp-waypoints">{TARGETS.map((target) => <div key={target.id}><i style={{ background: `#${target.color.toString(16)}` }} /><span>{target.label}</span><small>{Math.round(Math.hypot(simulation.astronautX - target.x, simulation.astronautZ - target.z))} m</small></div>)}<div><i className="home" /><span>Habitat airlock</span><small>{Math.round(distanceToHabitat)} m</small></div></div><p>Terrain and distances are generated for this training scenario and are not surveyed routes.</p></div></div>}
      {!running && simulation.outcome === 'active' && <div className="tp-paused"><div><span>SIMULATION PAUSED</span><h3>Resume surface operations</h3><p>Resource consumption and character movement are paused.</p><button className="button-primary" onClick={onResume} type="button">Resume simulation · click for mouse look</button></div></div>}
      {simulation.outcome !== 'active' && <div className="tp-paused"><div><span>{simulation.outcome === 'success' ? 'MISSION COMPLETE' : 'SURVIVAL LIMIT REACHED'}</span><h3>{simulation.outcome === 'success' ? 'Crew recovered safely' : 'Review the mission report'}</h3><p>Open the mission report for the final resource state and event history.</p><button className="button-primary" onClick={() => setMapOpen(true)} type="button">Review mission status</button></div></div>}
    </div>
  )
}
