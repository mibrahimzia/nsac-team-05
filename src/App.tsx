import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import './App.css'
import {
  addLog,
  checkSystems,
  completeMission,
  createInitialState,
  describeCondition,
  diagnoseRover,
  driveRover,
  formatMissionTime,
  getCo2Ppm,
  getIllumination,
  getOxygenPartialPressureKpa,
  getResourceLevels,
  getRoverRangeKm,
  hoursRemaining,
  inspectHabitat,
  inspectSavedState,
  isSunlit,
  performExperiment,
  patchHabitatLeak,
  prepareSuit,
  recoverRover,
  repairLifeSupport,
  returnFromEVA,
  startEVA,
  stepSimulation,
  simulateHabitatLeak,
  temperatureC,
  toggleSystem,
  toggleSuitService,
  updateAstronaut,
  type AstronautActivity,
  type SimulationState,
  type Site,
} from './simulation'

const ThirdPersonEVA = lazy(() => import('./ThirdPersonEVA'))

type Page = 'overview' | 'surface' | 'systems' | 'science' | 'report'
type Vector = { x: number; y: number }
type ResourceProps = {
  label: string
  value: string
  detail: string
  percent: number
  tone?: 'blue' | 'green' | 'amber' | 'red'
}

const SIMULATION_STORAGE_KEY = 'lunar-survival-save-v1'
const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'overview', label: 'Mission control', icon: '⌂' },
  { id: 'surface', label: 'Surface map', icon: '◉' },
  { id: 'systems', label: 'Life support', icon: '⌁' },
  { id: 'science', label: 'Science lab', icon: '⌕' },
  { id: 'report', label: 'Mission report', icon: '▤' },
]
const SCIENCE_TASKS = [
  {
    id: 'crater-ice',
    title: 'Crater illumination survey',
    location: 'Polar shadow edge',
    question: 'Does persistent shadow alone establish that water ice is present?',
    energy: '300 Wh',
    x: 56,
    y: 44,
  },
  {
    id: 'ridge-rock',
    title: 'Ridge rock comparison',
    location: 'Basaltic ridge',
    question: 'Do the synthetic reflectance differences identify composition with certainty?',
    energy: '300 Wh',
    x: 43,
    y: 29,
  },
  {
    id: 'thermal-probe',
    title: 'Subsurface thermal probe',
    location: 'Thermal target',
    question: 'How does the modeled subsurface temperature vary with illumination?',
    energy: '300 Wh',
    x: 78,
    y: 83,
  },
]

function migrateSavedState(value: unknown): SimulationState | null {
  if (inspectSavedState(value)) return value
  if (typeof value !== 'object' || value === null) return null
  const previous = value as Partial<SimulationState>
  if (previous.site !== 'training' && previous.site !== 'lowland' && previous.site !== 'polar') return null

  const defaults = createInitialState(previous.site)
  const isFiniteNumber = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' && Number.isFinite(candidate)
  const activities: AstronautActivity[] = [
    'resting', 'walking', 'running', 'sprinting', 'jumping', 'falling', 'landing', 'working',
  ]
  const migrated: SimulationState = {
    ...defaults,
    ...previous,
    suitTemperatureK: isFiniteNumber(previous.suitTemperatureK) ? previous.suitTemperatureK : defaults.suitTemperatureK,
    suitCo2Kg: isFiniteNumber(previous.suitCo2Kg) ? previous.suitCo2Kg : defaults.suitCo2Kg,
    suitWaterKg: isFiniteNumber(previous.suitWaterKg) ? previous.suitWaterKg : defaults.suitWaterKg,
    activityMode: previous.activityMode && activities.includes(previous.activityMode) ? previous.activityMode : 'resting',
    astronautX: isFiniteNumber(previous.astronautX) ? previous.astronautX : -22,
    astronautZ: isFiniteNumber(previous.astronautZ) ? previous.astronautZ : previous.evaActive ? -7.2 : 0,
    inHabitat: typeof previous.inHabitat === 'boolean' ? previous.inHabitat : !previous.evaActive,
    suitServiceActive: typeof previous.suitServiceActive === 'boolean' ? previous.suitServiceActive : false,
  }
  return inspectSavedState(migrated) ? migrated : null
}

function getInitialSimulation(): { state: SimulationState; notice: string } {
  try {
    const saved = window.localStorage.getItem(SIMULATION_STORAGE_KEY)
    if (!saved) return { state: createInitialState(), notice: '' }
    const parsed: unknown = JSON.parse(saved)
    const restored = migrateSavedState(parsed)
    if (!restored) {
      return {
        state: createInitialState(),
        notice: 'A saved mission was found but did not match this version. Start a new mission or overwrite the save.',
      }
    }
    return {
      state: restored,
      notice: inspectSavedState(parsed)
        ? 'Saved mission restored. The simulation is paused.'
        : 'Older saved mission restored with default EVA telemetry. The simulation is paused.',
    }
  } catch (error) {
    console.error('Unable to restore the lunar-survival save.', error)
    return { state: createInitialState(), notice: 'The saved mission could not be read. You can continue with a new mission.' }
  }
}

function ResourceCard({ label, value, detail, percent, tone = 'blue' }: ResourceProps) {
  return (
    <article className="resource-card">
      <div className="resource-head">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <span className={`meter-fill ${tone}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <p>{detail}</p>
    </article>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  enabled,
  onClick,
}: {
  label: string
  description: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <div className="toggle-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        className={`toggle ${enabled ? 'on' : ''}`}
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} ${enabled ? 'on' : 'off'}`}
        onClick={onClick}
      >
        <span />
      </button>
    </div>
  )
}

function TerrainMap({
  state,
  onSelect,
  waypoint,
}: {
  state: SimulationState
  onSelect: (point: Vector) => void
  waypoint: Vector | null
}) {
  const handleMapClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    onSelect({
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    })
  }

  return (
    <div className="map-frame">
      <div className="map-label map-label-top">N ↑ <span>LOCAL TERRAIN · SYNTHETIC</span></div>
      <svg
        aria-label="Interactive synthetic lunar surface map. Click to set a rover waypoint."
        className="terrain-map"
        onClick={handleMapClick}
        role="img"
        viewBox="0 0 100 100"
      >
        <defs>
          <pattern height="7" id="grid" patternUnits="userSpaceOnUse" width="7">
            <path d="M 7 0 L 0 0 0 7" fill="none" stroke="#718096" strokeOpacity=".13" strokeWidth=".2" />
          </pattern>
          <radialGradient id="crater">
            <stop offset="0" stopColor="#1c2530" />
            <stop offset=".58" stopColor="#66717b" />
            <stop offset=".72" stopColor="#29333c" />
            <stop offset="1" stopColor="#a39a88" />
          </radialGradient>
          <linearGradient id="shadow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#111c29" stopOpacity=".96" />
            <stop offset="1" stopColor="#111c29" stopOpacity=".16" />
          </linearGradient>
        </defs>
        <rect fill="#7e7c72" height="100" width="100" />
        <rect fill="url(#grid)" height="100" width="100" />
        <path d="M0 19 Q18 6 36 18 T72 15 T100 25 L100 30 Q80 19 63 29 T25 26 T0 32Z" fill="#9b9688" opacity=".56" />
        <path d="M0 76 Q23 64 42 73 T79 68 T100 72 L100 81 Q76 76 57 84 T18 83 T0 91Z" fill="#625f59" opacity=".48" />
        <path d="M30 43 Q38 32 48 38 L55 49 48 58 34 56Z" fill="#827f73" stroke="#bbb29d" strokeOpacity=".3" strokeWidth=".8" />
        <ellipse cx="65" cy="51" fill="url(#crater)" rx="16" ry="14" />
        <ellipse cx="65" cy="51" fill="none" rx="18" ry="16" stroke="#d4c7a8" strokeOpacity=".58" strokeWidth="1.5" />
        <ellipse cx="43" cy="29" fill="url(#crater)" rx="8" ry="7" />
        <ellipse cx="43" cy="29" fill="none" rx="9" ry="8" stroke="#d4c7a8" strokeOpacity=".4" strokeWidth="1" />
        <path d="M68 74 Q81 67 100 66 L100 100 62 100 Q75 88 68 74Z" fill="url(#shadow)" />
        <path d="M15 51 C27 45 34 40 43 29" fill="none" stroke="#c1d9cb" strokeDasharray="1.5 2" strokeOpacity=".7" strokeWidth=".7" />
        <path d="M15 51 C33 57 48 56 65 51" fill="none" stroke="#d3b57b" strokeDasharray="1.5 2" strokeOpacity=".65" strokeWidth=".7" />
        <path d="M15 51 C33 67 50 79 78 83" fill="none" stroke="#94a9c5" strokeDasharray="1.5 2" strokeOpacity=".55" strokeWidth=".7" />
        <g className="map-target" transform="translate(43 29)">
          <circle r="2.1" />
          <text x="3" y="1">RIDGE</text>
        </g>
        <g className="map-target" transform="translate(56 44)">
          <circle r="2.1" />
          <text x="4" y="-2">RIM</text>
        </g>
        <g className="map-target" transform="translate(78 83)">
          <circle r="2.1" />
          <text x="-19" y="6">THERMAL</text>
        </g>
        <g className="habitat-marker" transform="translate(14 51)">
          <circle r="3.3" />
          <path d="M-1.6 1.3V-1.5L0-2.7 1.6-1.5V1.3Z" />
          <text x="-2" y="7">HAB</text>
        </g>
        <g className="rover-marker" transform={`translate(${state.rover.x} ${state.rover.y}) rotate(${(state.rover.heading * 180) / Math.PI})`}>
          <circle r="3.5" />
          <path d="M-1.8-2.3 2.4 0 -1.8 2.3Z" />
        </g>
        {waypoint && <g className="waypoint-marker" transform={`translate(${waypoint.x} ${waypoint.y})`}><circle r="3.1" /><path d="M0-1.8V1.8M-1.8 0H1.8" /></g>}
        <rect fill="transparent" height="100" width="100" />
      </svg>
      <div className="map-label map-label-bottom">
        <span>● Habitat</span><span>◆ Rover</span><span>◉ Science target</span><span>▰ Shadow</span>
      </div>
      <p className="map-hint">Click the map to set a waypoint · dashed routes are illustrative, not surveyed paths.</p>
    </div>
  )
}

function App() {
  const [page, setPage] = useState<Page>('overview')
  const [initialSimulation] = useState(getInitialSimulation)
  const [state, setState] = useState<SimulationState>(initialSimulation.state)
  const [selectedSite, setSelectedSite] = useState<Site>(initialSimulation.state.site)
  const [running, setRunning] = useState(false)
  const [timeScale, setTimeScale] = useState(60)
  const [thirdPersonMode, setThirdPersonMode] = useState(true)
  const [waypoint, setWaypoint] = useState<Vector | null>(null)
  const [waypointLabel, setWaypointLabel] = useState('No active waypoint')
  const [notice, setNotice] = useState(initialSimulation.notice)
  const [showDetails, setShowDetails] = useState(false)
  const stateRef = useRef(state)
  const accumulatorRef = useRef(0)
  const lastFrameRef = useRef(0)
  const heldKeysRef = useRef<Vector>({ x: 0, y: 0 })
  const waypointRef = useRef<Vector | null>(null)

  const updateState = useCallback((update: (current: SimulationState) => SimulationState) => {
    const next = update(stateRef.current)
    stateRef.current = next
    setState(next)
  }, [])

  const handleAstronautPosition = useCallback((position: { x: number; z: number }, activity: AstronautActivity) => {
    const current = stateRef.current
    if (
      Math.abs(current.astronautX - position.x) < 0.06 &&
      Math.abs(current.astronautZ - position.z) < 0.06 &&
      current.activityMode === activity
    ) return
    updateState((latest) => updateAstronaut(latest, position, activity))
  }, [updateState])

  useEffect(() => {
    if (!running || state.outcome !== 'active') return
    accumulatorRef.current = 0
    lastFrameRef.current = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      accumulatorRef.current += ((now - lastFrameRef.current) / 1_000) * timeScale
      lastFrameRef.current = now
      const steps = Math.min(300, Math.floor(accumulatorRef.current))
      if (steps < 1) return
      accumulatorRef.current -= steps

      updateState((current) => {
        let next = current
        for (let index = 0; index < steps && next.outcome === 'active'; index += 1) {
          let direction = heldKeysRef.current
          const target = waypointRef.current
          if (target) {
            const dx = target.x - next.rover.x
            const dy = target.y - next.rover.y
            if (Math.hypot(dx, dy) < 1.15) {
              waypointRef.current = null
              setWaypoint(null)
              setWaypointLabel('Waypoint reached')
              if (target.x < 22 && target.y > 38 && target.y < 64 && next.evaActive) {
                next = returnFromEVA(next)
              }
              direction = { x: 0, y: 0 }
            } else {
              direction = { x: dx, y: dy }
            }
          }
          if (next.evaActive && (direction.x !== 0 || direction.y !== 0)) {
            next = driveRover(next, direction.x, direction.y, 1)
          }
          next = stepSimulation(next, 1)
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [running, state.outcome, timeScale, updateState])

  useEffect(() => {
    const keyDirection = (event: KeyboardEvent, pressed: boolean) => {
      if (page !== 'surface' || thirdPersonMode) return
      const directions: Record<string, Vector> = {
        ArrowUp: { x: 0, y: -1 },
        w: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        s: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        a: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        d: { x: 1, y: 0 },
      }
      const vector = directions[event.key]
      if (!vector) return
      event.preventDefault()
      heldKeysRef.current = pressed ? vector : { x: 0, y: 0 }
      if (pressed) {
        waypointRef.current = null
        setWaypoint(null)
        setWaypointLabel('Manual control')
      }
    }
    const keyDown = (event: KeyboardEvent) => keyDirection(event, true)
    const keyUp = (event: KeyboardEvent) => keyDirection(event, false)
    const pointerUp = () => { heldKeysRef.current = { x: 0, y: 0 } }
    const handleBlur = () => { heldKeysRef.current = { x: 0, y: 0 } }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [page, thirdPersonMode])

  const illumination = getIllumination(state)
  const co2Ppm = getCo2Ppm(state)
  const levels = getResourceLevels(state)
  const missionTime = formatMissionTime(state.elapsedSeconds)
  const oxygenHours = hoursRemaining(
    state.oxygenKg,
    Math.max(0.05, 1.68 - (state.systems.electrolyzer ? 0.45 : 0)),
  )
  const currentTerrain = useMemo(() => {
    if (state.rover.x > 57 && state.rover.x < 72 && state.rover.y > 35 && state.rover.y < 68) return 'Crater rim'
    if (state.rover.x > 35 && state.rover.x < 50 && state.rover.y > 18 && state.rover.y < 38) return 'Basaltic ridge'
    if (state.rover.x > 65 && state.rover.y > 68) return 'Shadowed plain'
    return 'Regolith plain'
  }, [state.rover.x, state.rover.y])

  const objectives = [
    { title: 'Inspect the habitat pressure boundary', done: state.flags.habitatInspected },
    { title: 'Complete an initial systems check', done: state.flags.systemCheckComplete },
    { title: 'Collect two evidence-based science observations', done: state.experiments.length >= 2 },
    { title: 'Return safely from EVA', done: !state.evaActive && state.experiments.length > 0 },
    { title: 'Diagnose and recover the rover after its fault', done: state.flags.roverRecovered },
  ]
  const reportReady = state.flags.habitatInspected &&
    state.flags.systemCheckComplete &&
    state.experiments.length >= 2 &&
    (!state.rover.immobilized || state.flags.roverRecovered) &&
    !state.evaActive
  const completedObjectives = objectives.filter((objective) => objective.done).length
  const missionProgress = Math.round((completedObjectives / objectives.length) * 100)

  const chooseWaypoint = (point: Vector, label = 'Custom waypoint') => {
    waypointRef.current = point
    setWaypoint(point)
    setWaypointLabel(label)
  }

  const startNewMission = () => {
    if (state.elapsedSeconds > 0 && !window.confirm('Start a new mission? Current unsaved progress will be replaced.')) return
    const fresh = createInitialState(selectedSite)
    stateRef.current = fresh
    setState(fresh)
    setRunning(false)
    setWaypoint(null)
    waypointRef.current = null
    setNotice('New lunar training mission initialized.')
  }

  const saveMission = () => {
    try {
      window.localStorage.setItem(SIMULATION_STORAGE_KEY, JSON.stringify(stateRef.current))
      setNotice('Mission saved on this device.')
    } catch (error) {
      console.error('Unable to save the lunar-survival mission.', error)
      setNotice('Save failed. Browser storage may be unavailable or full.')
    }
  }

  const loadMission = () => {
    try {
      const saved = window.localStorage.getItem(SIMULATION_STORAGE_KEY)
      if (!saved) {
        setNotice('No saved mission is available on this device.')
        return
      }
      const parsed: unknown = JSON.parse(saved)
      const restored = migrateSavedState(parsed)
      if (!restored) {
        setNotice('The saved mission is invalid or from an incompatible version.')
        return
      }
      stateRef.current = restored
      setState(restored)
      setSelectedSite(restored.site)
      setRunning(false)
      setWaypoint(null)
      waypointRef.current = null
      setNotice(inspectSavedState(parsed)
        ? 'Mission loaded and paused.'
        : 'Older mission loaded with default EVA telemetry and paused.')
    } catch (error) {
      console.error('Unable to load the lunar-survival mission.', error)
      setNotice('Load failed. The saved mission could not be read.')
    }
  }

  const act = (action: (current: SimulationState) => SimulationState) => {
    updateState((current) => action(current))
  }

  const setDrive = (vector: Vector) => {
    heldKeysRef.current = vector
    waypointRef.current = null
    setWaypoint(null)
    setWaypointLabel('Manual control')
  }

  const targetAction = (x: number, y: number, label: string) => {
    setPage('surface')
    chooseWaypoint({ x, y }, label)
  }

  const startEVAFromChecklist = () => {
    act((current) => startEVA(prepareSuit(current)))
  }

  const handleThirdPersonInteraction = (interaction: string): boolean => {
    if (interaction === 'airlock') {
      if (stateRef.current.inHabitat) {
        let evaStarted = false
        updateState((current) => {
          const staged = prepareSuit(current)
          const next = startEVA(updateAstronaut(staged, { x: -22, z: -7.2 }, 'resting'))
          evaStarted = next.evaActive
          return next
        })
        if (!evaStarted) return false
        setRunning(true)
      } else {
        if (!stateRef.current.evaActive) return false
        updateState((current) => returnFromEVA(current))
      }
      return true
    }
    if (interaction === 'service') {
      act(toggleSuitService)
      return true
    }
    if (interaction === 'rover') {
      act((current) => addLog(current, 'Rover inspection complete. Use the rover map view for vehicle driving and recovery controls.'))
      return true
    }
    if (SCIENCE_TASKS.some((task) => task.id === interaction)) {
      const task = SCIENCE_TASKS.find((item) => item.id === interaction)
      if (!task) return false
      act((current) => performExperiment(current, interaction, { x: task.x, y: task.y }))
      return true
    }
    return false
  }

  const selectSurfaceMode = (useThirdPerson: boolean) => {
    setThirdPersonMode(useThirdPerson)
    heldKeysRef.current = { x: 0, y: 0 }
    waypointRef.current = null
    setWaypoint(null)
  }

  const finishReport = () => {
    act(completeMission)
    setRunning(false)
    setPage('report')
  }

  const renderHeader = () => (
    <header className="topbar">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('overview') }}>
        <div className="brand-symbol"><span /><span /><span /></div>
        <div><strong>LUNAR SURVIVAL</strong><small>Mission simulator · v1.0</small></div>
      </a>
      <nav className="primary-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            aria-current={page === item.id ? 'page' : undefined}
            className={page === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => setPage(item.id)}
            type="button"
          >
            <span aria-hidden="true">{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>
      <div className="crew-profile">
        <div className="avatar">EV</div>
        <div><strong>Expedition 07</strong><small>2 crew · habitat team</small></div>
        <span className={`status-pill ${state.outcome}`}>{state.outcome === 'active' ? 'LIVE SIM' : state.outcome.toUpperCase()}</span>
      </div>
    </header>
  )

  const renderTopline = () => (
    <section className="mission-topline">
      <div>
        <div className="kicker"><span className="live-dot" /> LUNAR SURFACE OPERATIONS <span className="separator">/</span> {state.site === 'polar' ? 'POLAR RIDGE' : state.site === 'lowland' ? 'LOW-LATITUDE PLAIN' : 'TRAINING SITE'}</div>
        <h1>{page === 'overview' ? 'Mission control' : page === 'surface' ? 'Surface operations' : page === 'systems' ? 'Habitat systems' : page === 'science' ? 'Field science' : 'Mission debrief'}</h1>
      </div>
      <div className="mission-clock">
        <span>MISSION ELAPSED</span>
        <strong>{missionTime}</strong>
        <small>{isSunlit(state) ? '☼ Local illumination' : '◐ Local darkness'} · {Math.round(illumination * 100)}%</small>
      </div>
    </section>
  )

  const renderRunControls = () => (
    <div className="run-controls">
      <button className={`run-button ${running ? 'paused' : ''}`} onClick={() => setRunning((value) => !value)} type="button" disabled={state.outcome !== 'active'}>
        <span aria-hidden="true">{running ? 'Ⅱ' : '▶'}</span>{running ? 'Pause simulation' : 'Run simulation'}
      </button>
      <label className="time-scale">
        <span>TIME RATE</span>
        <select aria-label="Simulation time acceleration" onChange={(event) => setTimeScale(Number(event.target.value))} value={timeScale}>
          <option value={1}>1× real time</option>
          <option value={30}>30× accelerated</option>
          <option value={60}>60× accelerated</option>
          <option value={120}>120× accelerated</option>
        </select>
      </label>
      <button className="icon-button" disabled={running} onClick={() => updateState((current) => stepSimulation(current, 1))} type="button" title="Advance one fixed simulation step">Step 1 s</button>
      <button className="icon-button" onClick={saveMission} type="button" title="Save mission">Save</button>
      <button className="icon-button" onClick={loadMission} type="button" title="Load saved mission">Load</button>
      <button className="icon-button new-mission" onClick={startNewMission} type="button">New mission</button>
    </div>
  )

  const renderOverview = () => (
    <>
      <section className="overview-hero">
        <div className="hero-copy">
          <div className="kicker">MISSION 01 <span className="separator">·</span> LANDING & INITIAL SAFETY</div>
          <h2>Every watt counts.<br /><em>Every breath matters.</em></h2>
          <p>Keep a two-person lunar outpost alive, protect the crew, and bring home evidence. Your decisions consume real modeled time, power, and supplies.</p>
          <div className="hero-actions">
            <button className="button-primary" onClick={() => setPage('surface')} type="button">Open surface map <span>↗</span></button>
            <button className="button-quiet" onClick={() => setPage('systems')} type="button">Review life support</button>
          </div>
        </div>
        <div className="hero-instrument">
          <div className="instrument-sun"><span>☼</span></div>
          <div className="instrument-line" />
          <div className="instrument-readout"><span>LANDING SITE</span><strong>{state.site === 'training' ? 'Training site' : state.site === 'lowland' ? 'Low-latitude plain' : 'Polar ridge'}</strong><small>{state.site === 'training' ? 'Illustrative 12 h / 12 h light cycle' : state.site === 'lowland' ? 'Illustrative 24 h light / 24 h dark cycle' : 'Long light window with local-horizon attenuation'}</small></div>
          <div className="instrument-conditions"><span><i className={isSunlit(state) ? 'condition-sun' : 'condition-shadow'} /> {Math.round(illumination * 100)}% illumination</span><span>g <strong>1.62 m/s²</strong></span></div>
          <label className="site-select">NEXT MISSION SITE
            <select onChange={(event) => setSelectedSite(event.target.value as Site)} value={selectedSite}>
              <option value="training">Training site · 12 h day / 12 h night</option>
              <option value="lowland">Low-latitude plain · 24 h light / 24 h dark</option>
              <option value="polar">Polar ridge · long light window</option>
            </select>
          </label>
        </div>
      </section>

      <div className="overview-grid">
        <section className="panel resource-panel">
          <div className="panel-heading">
            <div><div className="kicker">CREW & HABITAT</div><h3>Survival reserves</h3></div>
            <button className="text-button" onClick={() => setPage('systems')} type="button">System details <span>↗</span></button>
          </div>
          <div className="resource-grid">
            <ResourceCard label="Oxygen" value={`${state.oxygenKg.toFixed(1)} kg`} detail={`${Math.max(0, oxygenHours).toFixed(0)} h at current modeled use`} percent={levels.oxygen} tone={levels.oxygen < 20 ? 'red' : 'blue'} />
            <ResourceCard label="Potable water" value={`${state.waterKg.toFixed(1)} kg`} detail={`${state.wastewaterKg.toFixed(1)} kg wastewater · recycling on`} percent={levels.water} tone={levels.water < 20 ? 'amber' : 'blue'} />
            <ResourceCard label="Food stores" value={`${state.foodKg.toFixed(1)} kg`} detail="2 crew · 2.07 kg/day modeled" percent={levels.food} tone={levels.food < 20 ? 'amber' : 'green'} />
            <ResourceCard label="Battery bank" value={`${(state.batteryWh / 1_000).toFixed(1)} kWh`} detail={`${Math.round(levels.power)}% state of charge`} percent={levels.power} tone={levels.power < 20 ? 'red' : 'green'} />
          </div>
        </section>

        <section className="panel objective-panel">
          <div className="panel-heading">
            <div><div className="kicker">FLIGHT PLAN</div><h3>Mission objectives</h3></div>
            <span className="progress-count">{completedObjectives}/{objectives.length}</span>
          </div>
          <div className="objective-progress"><span style={{ width: `${missionProgress}%` }} /></div>
          <div className="flight-actions">
            <button className="button-quiet" disabled={state.flags.habitatInspected} onClick={() => act(inspectHabitat)} type="button">Inspect habitat</button>
            <button className="button-quiet" disabled={state.flags.systemCheckComplete} onClick={() => act(checkSystems)} type="button">Initial systems check</button>
          </div>
          <div className="objective-list">
            {objectives.map((objective) => (
              <div className={`objective ${objective.done ? 'complete' : ''}`} key={objective.title}>
                <span className="check-mark">{objective.done ? '✓' : ''}</span><span>{objective.title}</span>
              </div>
            ))}
          </div>
          <button className="button-primary report-button" disabled={!reportReady} onClick={finishReport} type="button">
            {state.outcome === 'success' ? 'Mission report submitted' : 'Submit mission report'} <span>↗</span>
          </button>
        </section>
      </div>

      <section className="panel telemetry-panel">
        <div className="panel-heading">
          <div><div className="kicker">LIVE TELEMETRY</div><h3>Outpost status</h3></div>
          <span className="simulated-tag">● SIMULATED DATA</span>
        </div>
        <div className="telemetry-grid">
          <Metric label="CABIN PRESSURE" value={`${state.cabinPressureKpa.toFixed(1)} kPa`} detail="pressurized boundary" />
          <Metric label="CO₂ CONCENTRATION" value={`${Math.round(co2Ppm).toLocaleString()} ppm`} detail={co2Ppm > 5_000 ? 'scrubber attention' : 'scrubber nominal'} />
          <Metric label="CABIN TEMPERATURE" value={`${temperatureC(state.cabinTemperatureK).toFixed(1)} °C`} detail={describeCondition(state.cabinTemperatureK > 285 && state.cabinTemperatureK < 303 ? 100 : 55)} />
          <Metric label="CREW CONDITION" value={`${Math.round(state.crewCondition)}%`} detail={describeCondition(state.crewCondition)} />
          <Metric label="SOLAR ARRAY" value={`${(4.1 * illumination * (1 - state.solarDust)).toFixed(1)} kW`} detail={`${Math.round(state.solarDust * 100)}% dust loss`} />
          <Metric label="RADIATION ESTIMATE" value={`${state.radiationMsv.toFixed(3)} mSv`} detail="scenario estimate · not a forecast" />
        </div>
      </section>

      <section className="panel campaign-panel">
        <div className="panel-heading">
          <div><div className="kicker">CAMPAIGN</div><h3>Eight mission phases</h3></div>
          <button className="text-button" onClick={() => setPage('report')} type="button">View debrief <span>↗</span></button>
        </div>
        <div className="campaign-grid">
          {[
            ['01', 'Landing & safety', state.flags.habitatInspected && state.flags.systemCheckComplete],
            ['02', 'First 72 hours', state.elapsedSeconds >= 72 * 3_600 && state.crewCondition > 50],
            ['03', 'Scientific EVA', state.experiments.length > 0 && !state.evaActive],
            ['04', 'Rover recovery', state.flags.roverRecovered],
            ['05', 'Power crisis', state.batteryWh > 5_000 && state.elapsedSeconds >= 6 * 3_600],
            ['06', 'Extended night', state.elapsedSeconds >= 8 * 86_400 && state.crewCondition > 50],
            ['07', 'Life-support emergency', state.flags.lifeSupportRepaired],
            ['08', 'Final expedition', state.outcome === 'success'],
          ].map(([number, title, done]) => (
            <div className={`campaign-step ${done ? 'done' : ''}`} key={String(number)}>
              <span>{String(number)}</span><strong>{String(title)}</strong><i>{done ? 'Complete' : 'Pending'}</i>
            </div>
          ))}
        </div>
        <p className="campaign-note">Campaign checkpoints are illustrative training goals. The current playable sortie focuses on habitat safety, survival resources, rover recovery, and a two-observation science report.</p>
      </section>
    </>
  )

  const renderSurface = () => (
    <>
      <section className="section-intro">
        <div><div className="kicker">EXTRA-VEHICULAR ACTIVITY · EVA</div><h2>Explore with a return plan.</h2><p>Survey the synthetic terrain, watch wheel slip and battery draw, then return to the habitat before suit reserves become critical.</p></div>
        <div className="safety-badge"><span>1.62</span><small>m/s² lunar gravity<br />no atmospheric drag</small></div>
      </section>
      <div className="surface-mode-switch" role="group" aria-label="Surface exploration mode">
        <button aria-pressed={thirdPersonMode} className={thirdPersonMode ? 'active' : ''} onClick={() => selectSurfaceMode(true)} type="button">Third-person EVA</button>
        <button aria-pressed={!thirdPersonMode} className={!thirdPersonMode ? 'active' : ''} onClick={() => selectSurfaceMode(false)} type="button">Rover map & controls</button>
      </div>
      {thirdPersonMode ? (
        <Suspense fallback={<div className="thirdperson-loading" role="status">Loading 3D lunar scene…</div>}>
          <ThirdPersonEVA
            simulation={state}
            running={running}
            onActivity={(activity) => updateState((current) => current.activityMode === activity ? current : updateAstronaut(current, { x: current.astronautX, z: current.astronautZ }, activity))}
            onPosition={handleAstronautPosition}
            onInteraction={handleThirdPersonInteraction}
            onResume={() => setRunning(true)}
            onPause={() => setRunning(false)}
            onOpenMap={() => setNotice('Navigation overlay opened. Waypoints are synthetic and not surveyed routes.')}
          />
        </Suspense>
      ) : <section className="surface-layout">
        <div className="panel map-panel">
          <div className="panel-heading">
            <div>            <div className="kicker">NAVIGATION GRID · LOCAL COORDINATES</div><h3>{state.site === 'polar' ? 'Polar ridge sector' : state.site === 'lowland' ? 'Low-latitude plain' : 'Training site sector'}</h3></div>
            <span className={`illumination-pill ${isSunlit(state) ? 'sunlit' : ''}`}>{isSunlit(state) ? '☼ SUNLIT' : '◐ SHADOW'} · {Math.round(illumination * 100)}%</span>
          </div>
          <TerrainMap state={state} onSelect={(point) => chooseWaypoint(point)} waypoint={waypoint} />
          <div className="map-targets">
            <button onClick={() => targetAction(43, 29, 'Basaltic ridge')} type="button"><span>01</span><strong>Basaltic ridge</strong><small>Rock comparison · 3.6 km</small><i>Moderate slope</i></button>
            <button onClick={() => targetAction(56, 44, 'Crater rim')} type="button"><span>02</span><strong>Crater rim</strong><small>Illumination survey · 4.2 km</small><i className="risk">Shadow hazard</i></button>
            <button onClick={() => targetAction(78, 83, 'Thermal target')} type="button"><span>03</span><strong>Thermal target</strong><small>Subsurface probe · 7.1 km</small><i className="risk">Loose regolith</i></button>
          </div>
        </div>

        <aside className="surface-sidebar">
          <section className="panel rover-panel">
            <div className="panel-heading"><div><div className="kicker">ROVER TELEMETRY</div><h3>R-02 Pathfinder</h3></div><span className={`status-dot ${state.rover.immobilized ? 'warning' : ''}`} /></div>
            <div className="rover-drawing"><div className="rover-art"><span /><span /><span /><span /><i /></div><div className="rover-labels"><span>6 × 6 ELECTRIC ROVER</span><strong>{currentTerrain}</strong></div></div>
            <div className="rover-stats">
              <Metric label="BATTERY" value={`${Math.round((state.rover.batteryWh / 18_000) * 100)}%`} detail={`${(state.rover.batteryWh / 1_000).toFixed(1)} kWh remaining`} />
              <Metric label="RETURN RANGE" value={`${getRoverRangeKm(state)} km`} detail="modeled reserve included" />
              <Metric label="WHEEL SLIP" value={`${Math.round(state.rover.slip * 100)}%`} detail={state.rover.slip > 0.45 ? 'traction degraded' : 'traction nominal'} />
              <Metric label="RECOVERY KITS" value={`${state.rover.recoveryKits}`} detail="limited spare parts" />
            </div>
            <div className="rover-status-line"><span>Navigation</span><strong>{waypointLabel}</strong></div>
            {state.rover.immobilized && <div className="fault-banner">TRACTION CONTROLLER FAULT · ROVER IMMOBILIZED</div>}
          </section>

          <section className="panel drive-panel">
            <div className="panel-heading"><div><div className="kicker">MANUAL CONTROL</div><h3>Drive controls</h3></div><span className="control-hint">W A S D / ARROWS</span></div>
            <div className="drive-layout">
              <div className="dpad" aria-label="Rover direction controls">
                <button aria-label="Drive forward" className="up" onPointerDown={() => setDrive({ x: 0, y: -1 })} type="button">↑</button>
                <button aria-label="Drive left" className="left" onPointerDown={() => setDrive({ x: -1, y: 0 })} type="button">←</button>
                <button aria-label="Emergency stop" className="stop" onClick={() => { setDrive({ x: 0, y: 0 }); setWaypointLabel('Emergency stop') }} type="button">■</button>
                <button aria-label="Drive right" className="right" onPointerDown={() => setDrive({ x: 1, y: 0 })} type="button">→</button>
                <button aria-label="Drive backward" className="down" onPointerDown={() => setDrive({ x: 0, y: 1 })} type="button">↓</button>
              </div>
              <div className="drive-info"><strong>{state.evaActive ? 'ROVER READY' : 'EVA REQUIRED'}</strong><p>{state.evaActive ? 'Hold a direction or select a map waypoint.' : 'Complete the suit checklist before driving.'}</p><small>Drive power is estimated from slope, speed, resistance and drivetrain efficiency.</small></div>
            </div>
            <div className="drive-actions">
              <button className="button-quiet" disabled={!state.evaActive} onClick={() => chooseWaypoint({ x: 14, y: 51 }, 'Return to habitat')} type="button">Return to habitat</button>
              <button className="button-quiet" disabled={!state.rover.immobilized} onClick={() => act(diagnoseRover)} type="button">Diagnose fault</button>
              <button className="button-primary" disabled={!state.rover.immobilized || !state.flags.roverFaultDiagnosed} onClick={() => act(recoverRover)} type="button">Use recovery kit</button>
            </div>
          </section>

          <section className="panel eva-quick">
            <div className="kicker">SUIT & EVA CHECK</div>
            <div className="eva-stats"><span>O₂ <strong>{state.suitOxygenKg.toFixed(2)} kg</strong></span><span>Battery <strong>{(state.suitBatteryWh / 1_000).toFixed(1)} kWh</strong></span><span>Integrity <strong>{Math.round(state.suitIntegrity)}%</strong></span></div>
            <div className="drive-actions">
              <button className="button-quiet" onClick={() => act(prepareSuit)} type="button">Run suit checklist</button>
              {state.evaActive
                ? <button className="button-primary" onClick={() => chooseWaypoint({ x: 14, y: 51 }, 'Return to habitat')} type="button">Route home</button>
                : <button className="button-primary" disabled={!state.suitPrepared} onClick={startEVAFromChecklist} type="button">Begin EVA</button>}
            </div>
            <p className="fine-print">Simulated suit values are not operational astronaut guidance. EVA automatically aborts at modeled reserve limits.</p>
          </section>
        </aside>
      </section>}
    </>
  )

  const renderSystems = () => (
    <>
      <section className="section-intro">
        <div><div className="kicker">HABITAT · PRESSURE VESSEL · LIFE SUPPORT</div><h2>Keep the outpost in balance.</h2><p>Power is finite. Atmosphere, water, thermal control, and crew health respond to the systems you keep online.</p></div>
        <button className="button-quiet" disabled={state.flags.habitatInspected} onClick={() => act(inspectHabitat)} type="button">{state.flags.habitatInspected ? 'Pressure boundary inspected' : 'Inspect pressure boundary · 5 min'}</button>
      </section>
      <div className="systems-grid">
        <section className="panel">
          <div className="panel-heading"><div><div className="kicker">ENVIRONMENTAL CONTROL</div><h3>Atmosphere & thermal</h3></div><span className="simulated-tag">MODEL TELEMETRY</span></div>
          <div className="atmosphere-visual">
            <div className="air-ring"><span>{state.habitatLeakKgPerSecond > 0 ? 'LEAK ACTIVE' : 'HABITAT'}</span><strong>{state.cabinPressureKpa.toFixed(1)}<small>kPa</small></strong></div>
            <div className="atmosphere-values"><div><span>Oxygen tank reserve</span><strong>{state.oxygenKg.toFixed(2)} kg</strong></div><div><span>CO₂ concentration</span><strong className={co2Ppm > 5_000 ? 'warning-text' : ''}>{Math.round(co2Ppm).toLocaleString()} ppm</strong></div><div><span>Cabin temperature</span><strong>{temperatureC(state.cabinTemperatureK).toFixed(1)} °C</strong></div><div><span>O₂ partial pressure¹</span><strong>{getOxygenPartialPressureKpa(state).toFixed(1)} kPa</strong></div><div><span>Pressure-boundary leak</span><strong className={state.habitatLeakKgPerSecond > 0 ? 'warning-text' : ''}>{state.habitatLeakKgPerSecond > 0 ? `${(state.habitatLeakKgPerSecond * 3_600).toFixed(2)} kg/h` : 'None detected'}</strong></div></div>
          </div>
          <div className="system-toggles">
            <ToggleRow description="Removes crew-produced CO₂; draws 165 W." enabled={state.systems.scrubber} label="CO₂ removal scrubber" onClick={() => act((current) => toggleSystem(current, 'scrubber'))} />
            <ToggleRow description="Recovers 76% of simulated wastewater; draws 135 W." enabled={state.systems.recycler} label="Water recovery" onClick={() => act((current) => toggleSystem(current, 'recycler'))} />
            <ToggleRow description="Adds up to 520 W when the habitat cools." enabled={state.systems.heaters} label="Thermal heaters" onClick={() => act((current) => toggleSystem(current, 'heaters'))} />
            <ToggleRow description="Crew communication and safety coordination; draws 55 W." enabled={state.systems.communications} label="Communications" onClick={() => act((current) => toggleSystem(current, 'communications'))} />
            <ToggleRow description="Field instruments draw an additional 95 W while enabled." enabled={state.systems.scienceInstruments} label="Science instruments" onClick={() => act((current) => toggleSystem(current, 'scienceInstruments'))} />
          </div>
          <div className="assumption-note"><strong>¹ Simplification:</strong> ideal-gas partial pressure is calculated from modeled cabin oxygen, inert-gas, and CO₂ inventories. The composition and thresholds are educational estimates, not medical guidance.</div>
        </section>

        <div className="systems-side">
          <section className="panel power-panel">
            <div className="panel-heading"><div><div className="kicker">ELECTRICAL POWER</div><h3>Power budget</h3></div><span className="power-value">{(state.batteryWh / 1_000).toFixed(1)}<small>kWh</small></span></div>
            <div className="power-level"><div className="power-bar"><span style={{ width: `${levels.power}%` }} /></div><div><span>{Math.round(levels.power)}% charge</span><span>{(state.batteryCapacityWh / 1_000).toFixed(0)} kWh capacity</span></div></div>
            <div className="power-breakdown">
              <div><span><i className="legend-dot solar" />Solar array</span><strong>{(4.1 * illumination * (1 - state.solarDust)).toFixed(2)} kW</strong></div>
              <div><span><i className="legend-dot load" />Base + active loads</span><strong>{(0.33 + (state.systems.scrubber ? .165 : 0) + (state.systems.recycler ? .135 : 0) + (state.systems.communications ? .055 : 0) + (state.systems.scienceInstruments ? .095 : 0) + (state.systems.electrolyzer ? 1.2 : 0)).toFixed(2)} kW</strong></div>
              <div><span><i className="legend-dot heater" />Heater draw</span><strong>{state.systems.heaters && state.cabinTemperatureK < 291 ? '0.52' : '0.00'} kW</strong></div>
            </div>
            <div className="system-toggles compact">
              <ToggleRow description="Consumes water and electricity to produce oxygen; hydrogen byproduct is tracked." enabled={state.systems.electrolyzer} label="Water electrolysis" onClick={() => act((current) => toggleSystem(current, 'electrolyzer'))} />
            </div>
            <p className="assumption-note">Solar model: 4.1 kW peak × scheduled illumination × array cleanliness. Selected light schedules are fictional accelerated scenarios, not lunar ephemerides or forecasts for a real landing site.</p>
          </section>
          <section className="panel water-panel">
            <div className="panel-heading"><div><div className="kicker">WATER BALANCE</div><h3>Closed-loop supplies</h3></div></div>
            <div className="water-balance"><div><span>Potable</span><strong>{state.waterKg.toFixed(1)}<small> kg</small></strong></div><i>−</i><div><span>Wastewater</span><strong>{state.wastewaterKg.toFixed(1)}<small> kg</small></strong></div><i>+</i><div><span>Hydrogen</span><strong>{state.hydrogenKg.toFixed(2)}<small> kg</small></strong></div></div>
            <p>Two crew members use water for drinking and hygiene. The recycler returns 76% of modeled wastewater only while powered; electrolysis consumes water and stores hydrogen as a tracked byproduct.</p>
          </section>
          <section className="panel fault-drill">
            <div><div className="kicker">TRAINING SCENARIOS</div><h3>Practice system failure drills</h3><p>Simulate a scrubber fault or pressure leak, then restore the system. Drills are scripted and clearly separate from baseline telemetry.</p></div>
            <div className="fault-actions"><button className="button-quiet" onClick={() => act((current) => ({ ...addLog(current, 'Training drill: scrubber failure simulated by crew command.'), systems: { ...current.systems, scrubber: false } }))} type="button">Trigger CO₂ fault</button><button className="button-primary" onClick={() => act(repairLifeSupport)} type="button">Service scrubber · 15 min</button></div>
            <div className="fault-actions"><button className="button-quiet" disabled={state.habitatLeakKgPerSecond > 0} onClick={() => act(simulateHabitatLeak)} type="button">Simulate pressure leak</button><button className="button-primary" disabled={state.habitatLeakKgPerSecond <= 0} onClick={() => act(patchHabitatLeak)} type="button">Patch leak · 20 min · {state.habitatRepairKits} kits</button></div>
          </section>
        </div>
      </div>
    </>
  )

  const renderScience = () => (
    <>
      <section className="section-intro">
        <div><div className="kicker">SYNTHETIC OBSERVATIONS · EVIDENCE FIRST</div><h2>Measure before you conclude.</h2><p>Field observations cost crew time and stored energy. A dark crater is not proof of water ice; describe what the evidence can and cannot support.</p></div>
        <div className="science-counter"><strong>{state.experiments.length}<small>/3</small></strong><span>observations logged</span></div>
      </section>
      <div className="science-layout">
        <div className="science-list">
          {SCIENCE_TASKS.map((task, index) => {
            const completed = state.experiments.includes(task.id)
            const atTarget = Math.hypot(state.rover.x - task.x, state.rover.y - task.y) <= 8
            return (
              <article className={`panel experiment-card ${completed ? 'completed' : ''}`} key={task.id}>
                <div className="experiment-number">0{index + 1}</div>
                <div className="experiment-content">
                  <div className="experiment-heading"><div><span className="kicker">{task.location.toUpperCase()}</span><h3>{task.title}</h3></div><span className="energy-cost">{task.energy}</span></div>
                  <p className="research-question"><strong>Research question</strong>{task.question}</p>
                  <div className="experiment-meta"><span>◷ 20 min crew time</span><span>⌁ science instrument</span><span>◌ synthetic data</span></div>
                  <button
                    className={completed ? 'button-quiet completed-button' : 'button-primary'}
                    disabled={completed || !state.evaActive || !atTarget || !state.systems.scienceInstruments || state.batteryWh < 1_500}
                    onClick={() => act((current) => performExperiment(current, task.id))}
                    type="button"
                  >
                    {completed ? 'Observation recorded ✓' : !state.evaActive ? 'Begin EVA to unlock' : !atTarget ? 'Navigate to this marked target' : !state.systems.scienceInstruments ? 'Enable instruments in power panel' : state.batteryWh < 1_500 ? 'Protect the habitat reserve' : 'Collect observation'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        <aside className="panel evidence-panel">
          <div className="panel-heading"><div><div className="kicker">FIELD NOTEBOOK</div><h3>Evidence log</h3></div><span className="simulated-tag">SIMULATED</span></div>
          {state.samples.length > 0 ? <div className="evidence-list">{state.samples.map((sample, index) => <div className="evidence-entry" key={`${index}-${sample}`}><span>OBSERVATION 0{index + 1}</span><p>{sample}</p><small>Scenario observation · generated locally</small></div>)}</div> : <div className="empty-notebook"><span>⌕</span><strong>No observations yet</strong><p>Prepare the suit, begin an EVA, travel to a marked target, and enable science instruments.</p></div>}
          <div className="evidence-guidance"><strong>Interpretation rule</strong><p>Record measurement, context, uncertainty, and an alternative explanation. Synthetic training outputs are not lunar measurements or NASA telemetry.</p></div>
          <button className="button-quiet full-width" onClick={() => setShowDetails((value) => !value)} type="button">{showDetails ? 'Hide model assumptions' : 'View model assumptions'}</button>
          {showDetails && <div className="assumption-note model-note">Terrain and experiment outputs are generated scenario data. No live lunar dataset is loaded. The crater survey reports illumination only and deliberately does not infer a water-ice discovery.</div>}
        </aside>
      </div>
    </>
  )

  const renderReport = () => (
    <>
      <section className="section-intro">
        <div><div className="kicker">MISSION DEBRIEF · TRAINING RECORD</div><h2>{state.outcome === 'success' ? 'Crew recovered. Report filed.' : state.outcome === 'failure' ? 'Mission terminated.' : 'Build a defensible mission report.'}</h2><p>The debrief summarizes this deterministic training run. All telemetry and observations are simulated; no NASA endorsement is implied.</p></div>
        <div className={`report-seal ${state.outcome}`}><span>{state.outcome === 'success' ? '✓' : state.outcome === 'failure' ? '!' : '07'}</span><small>{state.outcome === 'success' ? 'COMPLETE' : state.outcome === 'failure' ? 'ABORTED' : 'IN PROGRESS'}</small></div>
      </section>
      <div className="report-layout">
        <section className="panel report-summary">
          <div className="panel-heading"><div><div className="kicker">EXPEDITION SUMMARY</div><h3>Mission 01 · {state.site === 'polar' ? 'Polar ridge' : state.site === 'lowland' ? 'Low-latitude plain' : 'Training site'}</h3></div><span className="simulated-tag">TRAINING SIMULATION</span></div>
          <div className="report-stats"><Metric label="ELAPSED SIM TIME" value={missionTime} detail={`${state.elapsedSeconds.toLocaleString()} s fixed-step clock`} /><Metric label="SCIENCE OBSERVATIONS" value={`${state.experiments.length}/3`} detail="synthetic observations" /><Metric label="CREW CONDITION" value={`${Math.round(state.crewCondition)}%`} detail={describeCondition(state.crewCondition)} /><Metric label="RADIATION ESTIMATE" value={`${state.radiationMsv.toFixed(3)} mSv`} detail="scenario-only estimate" /></div>
          <h4 className="report-subhead">Mission objectives</h4>
          <div className="objective-list report-objectives">{objectives.map((objective) => <div className={`objective ${objective.done ? 'complete' : ''}`} key={objective.title}><span className="check-mark">{objective.done ? '✓' : ''}</span><span>{objective.title}</span></div>)}</div>
          {state.outcome === 'active' && <div className="report-cta"><p>{reportReady ? 'All report prerequisites are met. Submit to close out the sortie.' : 'Complete habitat inspection, initial systems check, two science tasks, return from EVA, and any required rover recovery.'}</p><button className="button-primary" disabled={!reportReady} onClick={finishReport} type="button">Submit mission report ↗</button></div>}
        </section>
        <aside className="panel debrief-panel">
          <div className="kicker">SYSTEMS AT RETURN</div><h3>Final state</h3>
          <div className="debrief-stats"><div><span>Oxygen remaining</span><strong>{state.oxygenKg.toFixed(2)} kg</strong></div><div><span>Potable water</span><strong>{state.waterKg.toFixed(2)} kg</strong></div><div><span>Food remaining</span><strong>{state.foodKg.toFixed(2)} kg</strong></div><div><span>Battery bank</span><strong>{(state.batteryWh / 1_000).toFixed(2)} kWh</strong></div><div><span>Cabin CO₂</span><strong>{Math.round(co2Ppm).toLocaleString()} ppm</strong></div><div><span>Habitat temperature</span><strong>{temperatureC(state.cabinTemperatureK).toFixed(1)} °C</strong></div></div>
          <h4 className="report-subhead">Event log</h4><div className="event-log">{state.log.slice(0, 10).map((entry, index) => <div className="log-entry" key={`${index}-${entry}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{entry}</p></div>)}</div>
        </aside>
      </div>
      <section className="panel assumptions-panel"><div className="kicker">MODEL TRANSPARENCY</div><h3>What this simulator does—and does not—claim</h3><div className="assumption-columns"><p><strong>Established fact:</strong> lunar surface gravity is approximately 1.62 m/s²; the Moon has no breathable atmosphere and ordinary aerodynamic drag is not modeled.</p><p><strong>Simplified models:</strong> resource rates, rover traction, habitat heat balance, illumination schedules, radiation dose, and system efficiencies are configurable educational approximations.</p><p><strong>Fictional scenario:</strong> terrain, events, equipment, and all displayed telemetry are generated for this game. They are not actual NASA measurements, operational procedures, medical guidance, or mission predictions.</p></div></section>
    </>
  )

  return (
    <div className="app-shell">
      {renderHeader()}
      <main className="main-content">
        {renderTopline()}
        <section className="control-strip">
          {renderRunControls()}
          {notice && <div className="notice" role="status"><span>ⓘ</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message" type="button">×</button></div>}
        </section>
        {page === 'overview' && renderOverview()}
        {page === 'surface' && renderSurface()}
        {page === 'systems' && renderSystems()}
        {page === 'science' && renderScience()}
        {page === 'report' && renderReport()}
      </main>
      <footer className="footer"><span>LUNAR SURVIVAL <i>·</i> EDUCATIONAL SIMULATION</span><span>All mission data shown is simulated and not endorsed by NASA.</span><button onClick={() => setNotice('Model details: 1-second fixed simulation steps, Euler integration for the simplified thermal and rover models, and deterministic scenario events. See the report for assumptions.')} type="button">Model notes</button></footer>
    </div>
  )
}

export default App
