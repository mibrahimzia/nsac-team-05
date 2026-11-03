export type Site = 'training' | 'lowland' | 'polar'
export type Activity = 'habitat' | 'eva'

export type RoverState = {
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  batteryWh: number
  slip: number
  immobilized: boolean
  recoveryKits: number
}

export type AstronautActivity =
  | 'resting'
  | 'walking'
  | 'running'
  | 'sprinting'
  | 'jumping'
  | 'falling'
  | 'landing'
  | 'working'

export type SimulationState = {
  elapsedSeconds: number
  site: Site
  oxygenKg: number
  waterKg: number
  wastewaterKg: number
  foodKg: number
  hydrogenKg: number
  co2Kg: number
  cabinOxygenMoles: number
  inertGasMoles: number
  cabinTemperatureK: number
  cabinPressureKpa: number
  habitatLeakKgPerSecond: number
  habitatRepairKits: number
  batteryWh: number
  batteryCapacityWh: number
  solarDust: number
  radiationMsv: number
  crewCondition: number
  fatigue: number
  stress: number
  rover: RoverState
  suitOxygenKg: number
  suitBatteryWh: number
  suitIntegrity: number
  suitTemperatureK: number
  suitCo2Kg: number
  suitWaterKg: number
  activityMode: AstronautActivity
  astronautX: number
  astronautZ: number
  inHabitat: boolean
  suitServiceActive: boolean
  suitPrepared: boolean
  evaActive: boolean
  systems: {
    scrubber: boolean
    recycler: boolean
    heaters: boolean
    communications: boolean
    scienceInstruments: boolean
    electrolyzer: boolean
  }
  flags: {
    habitatInspected: boolean
    systemCheckComplete: boolean
    roverFaultDiagnosed: boolean
    lifeSupportRepaired: boolean
    roverRecovered: boolean
  }
  experiments: string[]
  samples: string[]
  log: string[]
  outcome: 'active' | 'success' | 'failure'
}

export type ResourceLevels = {
  oxygen: number
  water: number
  food: number
  power: number
  co2: number
  temperature: number
}

export const CONSTANTS = {
  lunarGravity: 1.62,
  earthGravity: 9.80665,
  stefanBoltzmann: 5.670374419e-8,
  idealGasConstant: 8.314462618,
  habitatVolumeM3: 82,
  crewCount: 2,
  batteryCapacityWh: 84_000,
  scrubberLimitPpm: 5_000,
  oxygenLowKg: 8,
  waterLowKg: 18,
  safeTemperatureK: [285, 303] as const,
  gravityUnits: 'm/s²',
}

const DAY = 86_400
const CLAMP = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, digits = 2) => Number(value.toFixed(digits))

export function createInitialState(site: Site = 'training'): SimulationState {
  const cabinTemperatureK = 294.15
  const cabinPressureKpa = 70.3
  const cabinMoles = (cabinPressureKpa * 1_000 * CONSTANTS.habitatVolumeM3) /
    (CONSTANTS.idealGasConstant * cabinTemperatureK)
  return {
    elapsedSeconds: 0,
    site,
    oxygenKg: 58,
    waterKg: 152,
    wastewaterKg: 0,
    foodKg: 52,
    hydrogenKg: 0,
    co2Kg: 0.035,
    cabinOxygenMoles: cabinMoles * 0.21,
    inertGasMoles: cabinMoles * 0.79,
    cabinTemperatureK,
    cabinPressureKpa,
    habitatLeakKgPerSecond: 0,
    habitatRepairKits: 2,
    batteryWh: 61_000,
    batteryCapacityWh: CONSTANTS.batteryCapacityWh,
    solarDust: 0.04,
    radiationMsv: 0,
    crewCondition: 100,
    fatigue: 8,
    stress: 12,
    rover: {
      x: 14,
      y: 51,
      vx: 0,
      vy: 0,
      heading: 0,
      batteryWh: 18_000,
      slip: 0,
      immobilized: false,
      recoveryKits: 2,
    },
    suitOxygenKg: 5.4,
    suitBatteryWh: 5_600,
    suitIntegrity: 100,
    suitTemperatureK: 293.15,
    suitCo2Kg: 0.0003,
    suitWaterKg: 2.4,
    activityMode: 'resting',
    astronautX: -22,
    astronautZ: 0,
    inHabitat: true,
    suitServiceActive: false,
    suitPrepared: false,
    evaActive: false,
    systems: {
      scrubber: true,
      recycler: true,
      heaters: true,
      communications: true,
      scienceInstruments: false,
      electrolyzer: false,
    },
    flags: {
      habitatInspected: false,
      systemCheckComplete: false,
      roverFaultDiagnosed: false,
      lifeSupportRepaired: false,
      roverRecovered: false,
    },
    experiments: [],
    samples: [],
    log: ['Landing complete. Habitat and rover telemetry are simulated for this training scenario.'],
    outcome: 'active',
  }
}

export function addLog(state: SimulationState, message: string): SimulationState {
  return { ...state, log: [message, ...state.log].slice(0, 30) }
}

function advanceActionTime(state: SimulationState, seconds: number): SimulationState {
  let next = state
  for (let second = 0; second < seconds && next.outcome === 'active'; second += 1) {
    next = stepSimulation(next, 1)
  }
  return next
}

export function getIllumination(state: SimulationState): number {
  const cycleSeconds = state.site === 'lowland' ? DAY * 2 : DAY
  const phase = (state.elapsedSeconds % cycleSeconds) / cycleSeconds
  const lightStart = state.site === 'training' ? 0.18 : 0.08
  const lightEnd = state.site === 'training' ? 0.68 : state.site === 'lowland' ? 0.58 : 0.82
  const isDay = phase >= lightStart && phase < lightEnd
  if (!isDay) return 0
  const noon = state.site === 'training' ? 0.43 : state.site === 'lowland' ? 0.33 : 0.45
  const width = lightEnd - lightStart
  const elevationFactor = 0.45 + 0.55 * Math.cos(((phase - noon) / width) * Math.PI)
  const horizonFactor = state.site === 'polar' ? 0.84 + 0.16 * Math.cos((phase * Math.PI * 2) + 0.6) : 1
  return CLAMP(elevationFactor * horizonFactor, 0.12, 1)
}

export function getCo2Ppm(state: SimulationState): number {
  const totalMoles = state.cabinOxygenMoles + state.inertGasMoles + state.co2Kg / 0.04401
  const co2Moles = state.co2Kg / 0.04401
  return totalMoles > 0 ? Math.max(0, (co2Moles / totalMoles) * 1_000_000) : 0
}

export function getOxygenPartialPressureKpa(state: SimulationState): number {
  const totalMoles = state.cabinOxygenMoles + state.inertGasMoles + state.co2Kg / 0.04401
  return totalMoles > 0 ? (state.cabinPressureKpa * state.cabinOxygenMoles) / totalMoles : 0
}

export function getResourceLevels(state: SimulationState): ResourceLevels {
  return {
    oxygen: CLAMP((state.oxygenKg / 58) * 100, 0, 100),
    water: CLAMP((state.waterKg / 152) * 100, 0, 100),
    food: CLAMP((state.foodKg / 52) * 100, 0, 100),
    power: CLAMP((state.batteryWh / state.batteryCapacityWh) * 100, 0, 100),
    co2: CLAMP((getCo2Ppm(state) / CONSTANTS.scrubberLimitPpm) * 100, 0, 100),
    temperature: CLAMP(((state.cabinTemperatureK - 265) / 55) * 100, 0, 100),
  }
}

export function hoursRemaining(inventoryKg: number, rateKgPerDay: number): number {
  return rateKgPerDay > 0 ? (inventoryKg / rateKgPerDay) * 24 : Infinity
}

export function isSunlit(state: SimulationState): boolean {
  return getIllumination(state) > 0
}

export function stepSimulation(state: SimulationState, seconds = 1): SimulationState {
  if (state.outcome !== 'active') return state
  const dt = Math.max(0, seconds)
  if (dt === 0) return state

  const illumination = getIllumination(state)
  const solarPowerW = 4_100 * illumination * (1 - state.solarDust)
  const heaterPowerW = state.systems.heaters && state.cabinTemperatureK < 291 ? 520 : 0
  const coolingPowerW = state.cabinTemperatureK > 300 ? 250 : 0
  const loadsW =
    330 +
    (state.systems.scrubber ? 165 : 0) +
    (state.systems.recycler ? 135 : 0) +
    (state.systems.communications ? 55 : 0) +
    (state.systems.scienceInstruments ? 95 : 0) +
    (state.systems.electrolyzer ? 1_200 : 0) +
    (state.inHabitat && state.suitServiceActive ? 250 : 0) +
    heaterPowerW +
    coolingPowerW +
    (state.evaActive ? 60 : 0)
  const powerDeltaWh = ((solarPowerW - loadsW) * dt) / 3_600
  const batteryWh = CLAMP(state.batteryWh + powerDeltaWh, 0, state.batteryCapacityWh)
  const powerAvailable = solarPowerW + (state.batteryWh > 0 ? 6_000 : 0) >= loadsW
  const lifeSupportAvailable = powerAvailable && state.batteryWh > 1
  const workloadByActivity: Record<AstronautActivity, number> = {
    resting: 1,
    walking: 1.5,
    running: 2.2,
    sprinting: 3,
    jumping: 2.6,
    falling: 1.2,
    landing: 2,
    working: 3.5,
  }
  const suitWorkload = workloadByActivity[state.activityMode]

  const crewOxygenKg = (0.0000097 * CONSTANTS.crewCount) * dt
  const oxygenProducedKg = state.systems.electrolyzer && lifeSupportAvailable && state.waterKg > 0
    ? 0.0000052 * dt
    : 0
  const oxygenTransferredFromTankKg = Math.min(crewOxygenKg, state.oxygenKg)
  const cabinOxygenMoles = Math.max(
    0,
    state.cabinOxygenMoles -
      (crewOxygenKg / 0.032) +
      (oxygenTransferredFromTankKg / 0.032),
  )
  const electrolysisWaterKg = oxygenProducedKg * 1.125
  const crewWaterKg = (0.000055 * CONSTANTS.crewCount) * dt
  const wastewaterProducedKg = crewWaterKg * 0.72
  const recycledWaterKg = state.systems.recycler && lifeSupportAvailable
    ? Math.min(state.wastewaterKg + wastewaterProducedKg, wastewaterProducedKg * 0.76)
    : 0
  const foodConsumedKg = (0.000012 * CONSTANTS.crewCount) * dt
  const co2ProducedKg = (0.000012 * CONSTANTS.crewCount) * dt
  const co2RemovedKg = state.systems.scrubber && lifeSupportAvailable
    ? Math.min(state.co2Kg + co2ProducedKg, 0.000024 * dt)
    : 0
  const co2Kg = Math.max(0, state.co2Kg + co2ProducedKg - co2RemovedKg)
  const totalMolesBeforeLeak = cabinOxygenMoles + state.inertGasMoles + co2Kg / 0.04401
  const leakMoles = Math.min(totalMolesBeforeLeak, (state.habitatLeakKgPerSecond * dt) / 0.028)
  const leakFraction = totalMolesBeforeLeak > 0 ? leakMoles / totalMolesBeforeLeak : 0
  const remainingOxygenMoles = cabinOxygenMoles * (1 - leakFraction)
  const remainingInertGasMoles = state.inertGasMoles * (1 - leakFraction)
  const remainingCo2Kg = co2Kg * (1 - leakFraction)

  const sunHeatW = illumination * 220
  const internalHeatW = 360 + (lifeSupportAvailable ? 250 : 0) + heaterPowerW
  const temperatureK = Math.max(3, state.cabinTemperatureK)
  const environmentK = 230 + illumination * 25
  const radiativeHeatLossW = 0.82 * CONSTANTS.stefanBoltzmann * 1.8 *
    (temperatureK ** 4 - environmentK ** 4)
  const conductiveHeatLossW = 13 * (temperatureK - 285)
  const thermalCapacityJPerK = 2.2e7
  const thermalDelta = ((sunHeatW + internalHeatW - radiativeHeatLossW - conductiveHeatLossW) * dt) /
    thermalCapacityJPerK
  const cabinTemperatureK = CLAMP(state.cabinTemperatureK + thermalDelta, 180, 340)

  const rover = state.rover
  const roverAuxWh = rover.batteryWh > 0 ? (18 * dt) / 3_600 : 0
  const roverBatteryWh = Math.max(0, rover.batteryWh - roverAuxWh)
  const roverFaultAt = 6 * 3_600
  const faultDue = state.elapsedSeconds < roverFaultAt && state.elapsedSeconds + dt >= roverFaultAt
  const solarDust = CLAMP(state.solarDust + (isSunlit(state) ? 0.000000025 * dt : 0), 0.02, 0.65)

  let next: SimulationState = {
    ...state,
    elapsedSeconds: state.elapsedSeconds + dt,
    oxygenKg: Math.max(0, state.oxygenKg + oxygenProducedKg - oxygenTransferredFromTankKg),
    waterKg: Math.max(0, state.waterKg - crewWaterKg - electrolysisWaterKg + recycledWaterKg),
    wastewaterKg: Math.max(0, state.wastewaterKg + wastewaterProducedKg - recycledWaterKg),
    foodKg: Math.max(0, state.foodKg - foodConsumedKg),
    hydrogenKg: state.hydrogenKg + (oxygenProducedKg * 0.125),
    co2Kg: remainingCo2Kg,
    cabinOxygenMoles: remainingOxygenMoles,
    inertGasMoles: remainingInertGasMoles,
    cabinTemperatureK,
    cabinPressureKpa: Math.max(
      0,
      ((remainingOxygenMoles + remainingInertGasMoles + remainingCo2Kg / 0.04401) *
        CONSTANTS.idealGasConstant * cabinTemperatureK) /
        (CONSTANTS.habitatVolumeM3 * 1_000),
    ),
    batteryWh,
    solarDust,
    radiationMsv: state.radiationMsv + (0.000012 * dt * (state.evaActive ? 5 : 1)),
    crewCondition: CLAMP(
      state.crewCondition -
        (state.oxygenKg < CONSTANTS.oxygenLowKg ? 0.0015 * dt : 0) -
        (state.waterKg < CONSTANTS.waterLowKg ? 0.0008 * dt : 0) -
        (state.foodKg < 6 ? 0.00025 * dt : 0) -
        (!lifeSupportAvailable ? 0.0005 * dt : 0) -
        (cabinTemperatureK < 275 || cabinTemperatureK > 315 ? 0.0004 * dt : 0),
      0,
      100,
    ),
    fatigue: CLAMP(state.fatigue + (state.evaActive ? 0.00025 * suitWorkload * dt : -0.00012 * dt), 0, 100),
    stress: CLAMP(
      state.stress + (state.oxygenKg < CONSTANTS.oxygenLowKg || batteryWh < 5_000 ? 0.0004 * dt : -0.00008 * dt),
      0,
      100,
    ),
    rover: { ...rover, batteryWh: roverBatteryWh },
  }

  let suitOxygenKg = state.suitOxygenKg
  let suitBatteryWh = state.suitBatteryWh
  let suitCo2Kg = state.suitCo2Kg
  let suitWaterKg = state.suitWaterKg
  let suitTemperatureK = state.suitTemperatureK
  if (state.evaActive) {
    const suitOxygenRateKgPerSecond = 0.0000097 * suitWorkload
    const suitCo2RateKgPerSecond = 0.000012 * suitWorkload
    const suitCoolingPowerW = state.suitTemperatureK > 295 ? 165 : 95
    const suitPowerW =
      115 +
      (state.activityMode === 'sprinting' ? 80 : state.activityMode === 'running' ? 30 : 0) +
      (state.activityMode === 'jumping' || state.activityMode === 'working' ? 25 : 0) +
      suitCoolingPowerW * 0.2
    const suitBatteryUseWh = (suitPowerW * dt) / 3_600
    const suitCoolingAvailable = state.suitBatteryWh >= suitBatteryUseWh
    suitOxygenKg = Math.max(0, state.suitOxygenKg - suitOxygenRateKgPerSecond * dt)
    suitBatteryWh = Math.max(0, state.suitBatteryWh - suitBatteryUseWh)
    const co2RemovedKg = state.systems.scrubber && suitCoolingAvailable
      ? Math.min(state.suitCo2Kg + suitCo2RateKgPerSecond * dt, 0.000018 * dt)
      : 0
    suitCo2Kg = Math.max(0, state.suitCo2Kg + suitCo2RateKgPerSecond * dt - co2RemovedKg)
    suitWaterKg = Math.max(0, state.suitWaterKg - (0.000028 * suitWorkload * dt))
    const metabolicHeatW = 90 * suitWorkload
    const coolingW = suitCoolingAvailable ? Math.min(suitCoolingPowerW, 190) : 0
    suitTemperatureK = CLAMP(
      state.suitTemperatureK + ((metabolicHeatW - coolingW) * dt) / 22_000,
      250,
      360,
    )
    if (state.suitOxygenKg > 0) {
      state = { ...state, activityMode: state.activityMode }
    }
    next = { ...next, suitOxygenKg, suitBatteryWh, suitCo2Kg, suitWaterKg, suitTemperatureK }
    if (suitOxygenKg <= 0 || suitBatteryWh <= 0 || suitCo2Kg >= 0.02 ||
        suitTemperatureK < 275 || suitTemperatureK > 330 || suitWaterKg <= 0) {
      next = { ...next, outcome: 'failure', evaActive: false }
      next = addLog(next, `Mission ended: modeled suit survival limit reached (${suitOxygenKg <= 0 ? 'oxygen depleted' : suitBatteryWh <= 0 ? 'battery depleted' : suitCo2Kg >= 0.02 ? 'CO₂ removal exhausted' : suitTemperatureK < 275 || suitTemperatureK > 330 ? 'thermal limit exceeded' : 'hydration reserve depleted'}).`)
    }
  }

  if (state.inHabitat && state.suitServiceActive && state.outcome === 'active') {
    const servicePowerAvailable = solarPowerW > 0 || batteryWh > 1_000
    if (servicePowerAvailable) {
      const oxygenTransferredKg = Math.min(state.oxygenKg, 0.00004 * dt, 5.4 - suitOxygenKg)
      const waterTransferredKg = Math.min(state.waterKg, 0.00015 * dt, 2.4 - suitWaterKg)
      suitOxygenKg += oxygenTransferredKg
      suitWaterKg += waterTransferredKg
      suitBatteryWh = Math.min(5_600, suitBatteryWh + (250 * dt) / 3_600)
      suitCo2Kg = Math.max(0.0003, suitCo2Kg - 0.00002 * dt)
      suitTemperatureK += (293.15 - suitTemperatureK) * Math.min(1, dt / 900)
      next = {
        ...next,
        oxygenKg: Math.max(0, next.oxygenKg - oxygenTransferredKg),
        waterKg: Math.max(0, next.waterKg - waterTransferredKg),
        suitOxygenKg,
        suitWaterKg,
        suitBatteryWh,
        suitCo2Kg,
        suitTemperatureK,
      }
    }
  }
  if (state.evaActive) {
    const suitIntegrity = Math.max(0, state.suitIntegrity - (0.000002 * dt * (state.rover.slip > 0.5 ? 2 : 1)))
    next = { ...next, suitIntegrity }
    if (suitOxygenKg <= 0.35 || suitBatteryWh <= 300 || suitIntegrity <= 10) {
      next = { ...next, evaActive: false, stress: CLAMP(next.stress + 12, 0, 100) }
      next = addLog(next, 'EVA automatically aborted: suit return margin reached a modeled limit. Head back to the habitat.')
    }
  }

  if (faultDue) {
    next = { ...next, rover: { ...next.rover, immobilized: true, vx: 0, vy: 0 } }
    next = addLog(next, 'Scenario event: a simulated traction-control fault immobilized the rover. Diagnose before recovery.')
  }

  if (state.elapsedSeconds < 72 * 3_600 && next.elapsedSeconds >= 72 * 3_600) {
    next = addLog(next, '72-hour survival checkpoint reached. Review reserves before the next expedition.')
  }

  const ppm = getCo2Ppm(next)
  if (next.oxygenKg <= 0 || next.waterKg <= 0 || next.foodKg <= 0 || next.crewCondition <= 0 ||
      next.cabinPressureKpa < 35 || ppm > 25_000 || next.cabinTemperatureK < 250 ||
      next.cabinTemperatureK > 325) {
    next = { ...next, outcome: 'failure', evaActive: false }
    next = addLog(next, 'Mission ended: a modeled survival limit was exceeded. Review the event and resource history.')
  }

  return next
}

export function inspectHabitat(state: SimulationState): SimulationState {
  const next = advanceActionTime({
    ...state,
    flags: { ...state.flags, habitatInspected: true },
  }, 300)
  return addLog(next, 'Habitat inspection complete: pressure boundary and seals nominal in this scenario.')
}

export function checkSystems(state: SimulationState): SimulationState {
  const next = advanceActionTime({
    ...state,
    flags: { ...state.flags, systemCheckComplete: true },
  }, 600)
  return addLog(next, 'Life-support, power, and thermal system check completed. Oxygen reserve and CO₂ trend are nominal.')
}

export function toggleSystem(
  state: SimulationState,
  system: keyof SimulationState['systems'],
): SimulationState {
  const enabled = !state.systems[system]
  if (system === 'electrolyzer' && enabled && state.waterKg < 5) {
    return addLog(state, 'Electrolysis unavailable: reserve at least 5 kg of water before operating this system.')
  }
  const next = { ...state, systems: { ...state.systems, [system]: enabled } }
  return addLog(next, `${systemLabel(system)} ${enabled ? 'enabled' : 'disabled'}. Power budget updated.`)
}

export function prepareSuit(state: SimulationState): SimulationState {
  if (state.evaActive) return state
  if (state.suitOxygenKg < 1.2 || state.suitBatteryWh < 1_200 || state.suitIntegrity < 40) {
    return addLog(state, 'EVA preparation blocked: recharge or inspect suit systems before departure.')
  }
  if (state.rover.x > 20 || state.rover.y < 20 || state.rover.y > 80) {
    return addLog(state, 'EVA preparation blocked: crew must be at the habitat staging area.')
  }
  const next = { ...state, suitPrepared: true }
  return addLog(next, 'Suit check passed: pressure, oxygen reserve, battery, comms, and return plan verified (simulated limits).')
}

export function startEVA(state: SimulationState): SimulationState {
  if (!state.suitPrepared) return addLog(state, 'Complete the EVA checklist before leaving the habitat.')
  if (state.evaActive) return state
  const next = {
    ...state,
    evaActive: true,
    inHabitat: false,
    suitServiceActive: false,
    activityMode: 'resting' as const,
    suitPrepared: false,
    systems: { ...state.systems, communications: true },
  }
  return addLog(next, 'EVA started. Suit resources are now being consumed each fixed simulation step.')
}

export function returnFromEVA(state: SimulationState): SimulationState {
  if (!state.evaActive) return state
  const next = {
    ...state,
    evaActive: false,
    inHabitat: true,
    suitServiceActive: false,
    activityMode: 'resting' as const,
    astronautX: -22,
    astronautZ: -1,
    rover: { ...state.rover, x: 14, y: 51, vx: 0, vy: 0 },
  }
  return addLog(next, 'Crew returned to the habitat. Post-EVA suit inspection complete; dust level increased slightly.')
}

export function updateAstronaut(
  state: SimulationState,
  position: { x: number; z: number },
  activityMode: AstronautActivity,
): SimulationState {
  return {
    ...state,
    astronautX: position.x,
    astronautZ: position.z,
    activityMode,
  }
}

export function toggleSuitService(state: SimulationState): SimulationState {
  if (!state.inHabitat) return addLog(state, 'Suit service is only available from inside the habitat.')
  const active = !state.suitServiceActive
  return addLog(
    { ...state, suitServiceActive: active, activityMode: 'resting' },
    active
      ? 'Suit service started: oxygen and water transfer from habitat stores; suit battery charges if habitat power is available.'
      : 'Suit service paused.',
  )
}

export function driveRover(state: SimulationState, dx: number, dy: number, seconds = 1): SimulationState {
  if (state.outcome !== 'active' || state.rover.immobilized) return state
  if (!state.evaActive) return state
  if (state.rover.batteryWh < 150) return addLog(state, 'Rover drive inhibited: battery reserve is too low.')
  const angle = Math.atan2(dy, dx)
  const slopeDegrees = terrainSlope(state.rover.x, state.rover.y, dx, dy)
  const slope = (slopeDegrees * Math.PI) / 180
  const massKg = 760
  const resistanceCoefficient = 0.09
  const slopeForce = massKg * CONSTANTS.lunarGravity * Math.sin(slope)
  const resistanceForce = massKg * CONSTANTS.lunarGravity * resistanceCoefficient
  const traction = terrainType(state.rover.x, state.rover.y) === 'regolith' ? 0.72 : 0.94
  const acceleration = CLAMP(((650 * traction) - slopeForce - resistanceForce) / massKg, -0.18, 0.24)
  const speed = CLAMP(Math.hypot(state.rover.vx, state.rover.vy) + acceleration * seconds, 0, 2.8)
  const slip = CLAMP(Math.abs(slopeDegrees) / 38 + (1 - traction) * 0.45, 0, 0.95)
  const distance = (speed * seconds * (1 - slip * 0.45)) / 100
  const x = CLAMP(state.rover.x + Math.cos(angle) * distance, 4, 96)
  const y = CLAMP(state.rover.y + Math.sin(angle) * distance, 4, 96)
  const forceN = Math.max(0, slopeForce + resistanceForce)
  const powerW = Math.max(80, (forceN * speed) / 0.68 + 90)
  const energyWh = (powerW * seconds) / 3_600
  const next: SimulationState = {
    ...state,
    rover: {
      ...state.rover,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      heading: angle,
      slip,
      batteryWh: Math.max(0, state.rover.batteryWh - energyWh),
    },
  }
  return next
}

export function diagnoseRover(state: SimulationState): SimulationState {
  if (!state.rover.immobilized) return addLog(state, 'No active rover fault to diagnose.')
  const next = { ...state, flags: { ...state.flags, roverFaultDiagnosed: true } }
  return addLog(next, 'Diagnosis: traction controller fault is limiting wheel torque. A recovery kit can reset the controller.')
}

export function recoverRover(state: SimulationState): SimulationState {
  if (!state.rover.immobilized) return addLog(state, 'Rover is mobile; no recovery action is needed.')
  if (!state.flags.roverFaultDiagnosed) return addLog(state, 'Diagnose the rover fault before attempting recovery.')
  if (state.rover.recoveryKits <= 0) return addLog(state, 'Recovery failed: no controller recovery kits remain.')
  let next = {
    ...state,
    rover: { ...state.rover, immobilized: false, recoveryKits: state.rover.recoveryKits - 1, batteryWh: Math.max(0, state.rover.batteryWh - 800) },
    flags: { ...state.flags, roverRecovered: true },
  }
  next = advanceActionTime(next, 1_800)
  return addLog(next, 'Rover controller reset using one recovery kit. 800 Wh and 30 minutes were allocated to recovery.')
}

export function performExperiment(
  state: SimulationState,
  id: string,
  position?: { x: number; y: number },
): SimulationState {
  if (state.experiments.includes(id)) return addLog(state, 'This observation is already recorded in the mission log.')
  if (!state.evaActive) return addLog(state, 'Start an EVA and travel to the science target before collecting this observation.')
  if (state.rover.immobilized) return addLog(state, 'Experiment unavailable while the rover is immobilized.')
  const targets: Record<string, { x: number; y: number; name: string }> = {
    'crater-ice': { x: 56, y: 44, name: 'the crater rim' },
    'ridge-rock': { x: 43, y: 29, name: 'the basaltic ridge' },
    'thermal-probe': { x: 78, y: 83, name: 'the thermal target' },
  }
  const target = targets[id]
  const x = position?.x ?? state.rover.x
  const y = position?.y ?? state.rover.y
  if (!target || Math.hypot(x - target.x, y - target.y) > 8) {
    return addLog(state, `Travel to ${target?.name ?? 'the marked science site'} before collecting this observation.`)
  }
  if (state.batteryWh < 1_500) return addLog(state, 'Experiment postponed: protect the habitat battery reserve first.')
  if (!state.systems.scienceInstruments) return addLog(state, 'Enable science instruments in the power panel before collecting data.')
  const sampleById: Record<string, string> = {
    'crater-ice': 'Crater illumination survey: persistent shadow is confirmed in the synthetic map. This is not evidence of water ice.',
    'ridge-rock': 'Ridge spectral comparison: two synthetic rock classes differ in reflectance; composition remains uncertain.',
    'thermal-probe': 'Subsurface thermal probe: simulated temperature gradient recorded at the target. No real terrain measurement.',
  }
  const observation = sampleById[id] ?? 'Synthetic surface observation recorded with stated uncertainty.'
  let next = {
    ...state,
    experiments: [...state.experiments, id],
    samples: [...state.samples, observation],
    batteryWh: Math.max(0, state.batteryWh - 300),
    systems: { ...state.systems, scienceInstruments: false },
  }
  next = advanceActionTime(next, 1_200)
  return addLog(next, `Science task complete: ${observation}`)
}

export function repairLifeSupport(state: SimulationState): SimulationState {
  const ppm = getCo2Ppm(state)
  if (state.systems.scrubber && ppm < 1_500) {
    return addLog(state, 'Scrubber is functioning and cabin CO₂ is within this model’s normal range.')
  }
  let next: SimulationState = {
    ...state,
    systems: { ...state.systems, scrubber: true },
    co2Kg: Math.max(0.035, state.co2Kg * 0.65),
    flags: { ...state.flags, lifeSupportRepaired: true },
  }
  next = advanceActionTime(next, 900)
  return addLog(next, 'Scrubber cartridge replaced. CO₂ removal restored; one modeled spare cartridge was used.')
}

export function simulateHabitatLeak(state: SimulationState): SimulationState {
  if (state.habitatLeakKgPerSecond > 0) return addLog(state, 'A habitat leak is already active. Isolate and patch the pressure boundary.')
  const next = { ...state, habitatLeakKgPerSecond: 0.000025 }
  return addLog(next, 'Training drill: a small pressure-boundary leak is simulated. Cabin gas inventory and pressure will decline until patched.')
}

export function patchHabitatLeak(state: SimulationState): SimulationState {
  if (state.habitatLeakKgPerSecond <= 0) return addLog(state, 'No active pressure-boundary leak was found.')
  if (state.habitatRepairKits <= 0) return addLog(state, 'Habitat patch unavailable: no repair kits remain.')
  let next: SimulationState = {
    ...state,
    habitatLeakKgPerSecond: 0,
    habitatRepairKits: state.habitatRepairKits - 1,
  }
  next = advanceActionTime(next, 1_200)
  return addLog(next, 'Pressure boundary patched using one repair kit. Gas loss has stopped; verify cabin pressure.')
}

export function completeMission(state: SimulationState): SimulationState {
  const objectivesComplete = state.flags.habitatInspected &&
    state.flags.systemCheckComplete &&
    state.experiments.length >= 2 &&
    (!state.rover.immobilized || state.flags.roverRecovered) &&
    !state.evaActive
  if (!objectivesComplete) return addLog(state, 'Mission report unavailable: complete the habitat/system checks, two science tasks, rover recovery if required, and return from EVA.')
  const next = { ...state, outcome: 'success' as const }
  return addLog(next, 'Mission report submitted. Crew returned safely with two or more documented synthetic observations.')
}

export function terrainSlope(x: number, y: number, dx = 0, dy = 0): number {
  const base = 4 + Math.sin((x + dx * 8) * 0.12) * 5 + Math.cos((y + dy * 8) * 0.1) * 4
  if (x > 57 && x < 72 && y > 35 && y < 68) return 23 + Math.abs(base)
  if (x > 35 && x < 50 && y > 18 && y < 38) return 12 + Math.abs(base)
  return base
}

export function terrainType(x: number, y: number): 'regolith' | 'rock' | 'crater' | 'shadow' {
  if (x > 57 && x < 72 && y > 35 && y < 68) return 'crater'
  if (x > 35 && x < 50 && y > 18 && y < 38) return 'rock'
  if (x > 65 && y > 68) return 'shadow'
  return (Math.floor(x / 8) + Math.floor(y / 11)) % 3 === 0 ? 'regolith' : 'rock'
}

export function formatMissionTime(seconds: number): string {
  const totalHours = Math.floor(seconds / 3_600)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const minutes = Math.floor((seconds % 3_600) / 60)
  return `Sol ${String(days + 1).padStart(2, '0')} · ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function temperatureC(kelvin: number): number {
  return round(kelvin - 273.15, 1)
}

export function getRoverRangeKm(state: SimulationState): number {
  const usableWh = Math.max(0, state.rover.batteryWh - 1_000)
  return round((usableWh / 170) * 0.1, 1)
}

export function systemLabel(system: keyof SimulationState['systems']): string {
  const labels: Record<keyof SimulationState['systems'], string> = {
    scrubber: 'CO₂ scrubber',
    recycler: 'Water recycler',
    heaters: 'Thermal heaters',
    communications: 'Communications',
    scienceInstruments: 'Science instruments',
    electrolyzer: 'Water electrolysis',
  }
  return labels[system]
}

export function inspectSavedState(value: unknown): value is SimulationState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<SimulationState>
  const numericFields: (keyof SimulationState)[] = [
    'elapsedSeconds',
    'oxygenKg',
    'waterKg',
    'wastewaterKg',
    'foodKg',
    'hydrogenKg',
    'co2Kg',
    'cabinOxygenMoles',
    'inertGasMoles',
    'cabinTemperatureK',
    'cabinPressureKpa',
    'habitatLeakKgPerSecond',
    'habitatRepairKits',
    'batteryWh',
    'batteryCapacityWh',
    'solarDust',
    'radiationMsv',
    'crewCondition',
    'fatigue',
    'stress',
    'suitOxygenKg',
    'suitBatteryWh',
    'suitIntegrity',
    'suitTemperatureK',
    'suitCo2Kg',
    'suitWaterKg',
    'astronautX',
    'astronautZ',
  ]
  if (!numericFields.every((field) => typeof candidate[field] === 'number' && Number.isFinite(candidate[field]))) return false
  if (candidate.site !== 'training' && candidate.site !== 'lowland' && candidate.site !== 'polar') return false
  if (candidate.outcome !== 'active' && candidate.outcome !== 'success' && candidate.outcome !== 'failure') return false
  if (typeof candidate.evaActive !== 'boolean' || typeof candidate.suitPrepared !== 'boolean') return false
  if (typeof candidate.inHabitat !== 'boolean' || typeof candidate.suitServiceActive !== 'boolean') return false
  if (!['resting', 'walking', 'running', 'sprinting', 'jumping', 'falling', 'landing', 'working'].includes(String(candidate.activityMode))) return false
  if (!candidate.rover || !candidate.systems || !candidate.flags) return false
  if (!['x', 'y', 'vx', 'vy', 'heading', 'batteryWh', 'slip', 'recoveryKits'].every(
    (key) => typeof candidate.rover?.[key as keyof RoverState] === 'number' &&
      Number.isFinite(candidate.rover?.[key as keyof RoverState]),
  )) return false
  if (typeof candidate.rover.immobilized !== 'boolean') return false
  if (!['scrubber', 'recycler', 'heaters', 'communications', 'scienceInstruments', 'electrolyzer'].every(
    (key) => typeof candidate.systems?.[key as keyof SimulationState['systems']] === 'boolean',
  )) return false
  if (!['habitatInspected', 'systemCheckComplete', 'roverFaultDiagnosed', 'lifeSupportRepaired', 'roverRecovered'].every(
    (key) => typeof candidate.flags?.[key as keyof SimulationState['flags']] === 'boolean',
  )) return false
  return Array.isArray(candidate.experiments) &&
    candidate.experiments.every((item) => typeof item === 'string') &&
    Array.isArray(candidate.samples) &&
    candidate.samples.every((item) => typeof item === 'string') &&
    Array.isArray(candidate.log) &&
    candidate.log.every((item) => typeof item === 'string')
}

export function resourcePercent(value: number, maximum: number): number {
  return round(CLAMP((value / maximum) * 100, 0, 100), 0)
}

export function describeCondition(value: number): string {
  if (value >= 85) return 'Nominal'
  if (value >= 60) return 'Watch'
  if (value >= 30) return 'Degraded'
  return 'Critical'
}

export function precise(value: number, digits = 1): string {
  return round(value, digits).toFixed(digits)
}
