import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { PathSimulationLoad } from '../types/unitProperties'
import { PATH_SIMULATION_STEP_MS } from '../types/unitProperties'
import { dirToward } from './flowDirection'
import { getFootprintCells, getUnitFootprint } from './unitFootprint'
import {
  continuousEntryVacantTicksRequired,
  isEntryPointReadyForContinuousInject,
  spawnInboundSimulationLoads,
  tickEntryVacancy,
} from './pathSimulation'

function tickAllEntryVacancy(
  loads: PathSimulationLoad[],
  entryUnitIds: string[],
  prev: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const entryUnitId of entryUnitIds) {
    const state = tickEntryVacancy(entryUnitId, loads, {
      vacantTicks: prev[entryUnitId] ?? 0,
    })
    next[entryUnitId] = state.vacantTicks
  }
  return next
}

function isEntryUnoccupied(loads: PathSimulationLoad[], entryUnitId: string): boolean {
  return !loads.some(
    (load) =>
      !load.complete &&
      load.pathUnitIds.length > 0 &&
      load.pathUnitIds[load.stepIndex] === entryUnitId,
  )
}

function resolveEntryVacantTicks(
  loads: PathSimulationLoad[],
  entryUnitId: string,
  tickVacantByEntry: Record<string, number>,
): number {
  return tickEntryVacancy(entryUnitId, loads, {
    vacantTicks: tickVacantByEntry[entryUnitId] ?? 0,
  }).vacantTicks
}

function canInjectAtEntry(
  loads: PathSimulationLoad[],
  entryUnitId: string,
  tickVacantByEntry: Record<string, number>,
): boolean {
  const vacantTicks = resolveEntryVacantTicks(loads, entryUnitId, tickVacantByEntry)
  return isEntryPointReadyForContinuousInject(entryUnitId, loads, { vacantTicks })
}

export type GatherProbePhase =
  | 'toMineral'
  | 'mining'
  | 'toDepot'
  | 'depositing'

export interface GatherProbeState {
  entryUnitId: string
  /** 투입점당 프로브 슬롯 — 짧은 투입 주기에서 2대 교대 */
  probeSlot: number
  phase: GatherProbePhase
  phaseElapsedMs: number
  mineralDx: number
  mineralDy: number
  depotDx: number
  depotDy: number
  carrying: boolean
  /** 연속투입 직후 — 투입구가 비워질 때까지 광맥에서 채굴만 */
  awaitingEntryClear: boolean
  /** 첫 운반 사이클은 복귀(toMineral) 없이 채굴에서 시작 */
  bootstrapFromMining: boolean
}

export interface GatherProbeVisual {
  entryUnitId: string
  probeSlot: number
  depotX: number
  depotY: number
  mineralX: number
  mineralY: number
  probeX: number
  probeY: number
  carriedMineralX: number | null
  carriedMineralY: number | null
  carrying: boolean
  phase: GatherProbePhase
  travelT: number
}

const MINERAL_DISTANCE_CELLS = 2.75
const DEPOT_EDGE_PADDING = 0.45

const GATHER_DIRECTION_CANDIDATES = [
  { vx: 0, vy: -1 },
  { vx: -1, vy: 0 },
  { vx: 1, vy: 0 },
  { vx: 0, vy: 1 },
  { vx: -1, vy: -1 },
  { vx: 1, vy: -1 },
  { vx: -1, vy: 1 },
  { vx: 1, vy: 1 },
] as const

function occupiedCells(line: ConveyorLine): Set<string> {
  const set = new Set<string>()
  for (const unit of line.units) {
    const footprint = getUnitFootprint(unit)
    for (const cell of getFootprintCells(unit.gridX, unit.gridY, footprint)) {
      set.add(`${cell.gridX},${cell.gridY}`)
    }
  }
  return set
}

function unitCenter(unit: ConveyorUnit): { cx: number; cy: number } {
  const footprint = getUnitFootprint(unit)
  return {
    cx: unit.gridX + footprint.cols / 2,
    cy: unit.gridY + footprint.rows / 2,
  }
}

function normalizeVector(vx: number, vy: number): { vx: number; vy: number } {
  const len = Math.hypot(vx, vy)
  if (len < 1e-6) return { vx: 0, vy: -1 }
  return { vx: vx / len, vy: vy / len }
}

function gatherDirectionCandidates(
  entryUnit: ConveyorUnit,
  line: ConveyorLine,
  index: number,
): Array<{ vx: number; vy: number }> {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const preferred: Array<{ vx: number; vy: number }> = []

  for (const id of entryUnit.connections) {
    const neighbor = unitMap.get(id)
    if (!neighbor) continue
    const dir = dirToward(entryUnit, neighbor)
    if (!dir) continue
    const outbound =
      dir === 'N'
        ? { vx: 0, vy: -1 }
        : dir === 'S'
          ? { vx: 0, vy: 1 }
          : dir === 'E'
            ? { vx: 1, vy: 0 }
            : { vx: -1, vy: 0 }
    preferred.push(normalizeVector(-outbound.vx, -outbound.vy))
  }

  const rotated = [
    ...GATHER_DIRECTION_CANDIDATES.slice(index % GATHER_DIRECTION_CANDIDATES.length),
    ...GATHER_DIRECTION_CANDIDATES.slice(0, index % GATHER_DIRECTION_CANDIDATES.length),
  ].map((candidate) => normalizeVector(candidate.vx, candidate.vy))

  const seen = new Set<string>()
  const ordered: Array<{ vx: number; vy: number }> = []
  for (const candidate of [...preferred, ...rotated]) {
    const key = `${candidate.vx.toFixed(3)},${candidate.vy.toFixed(3)}`
    if (seen.has(key)) continue
    seen.add(key)
    ordered.push(candidate)
  }
  return ordered
}

function pickGatherLayout(
  entryUnit: ConveyorUnit,
  line: ConveyorLine,
  index: number,
): { mineralDx: number; mineralDy: number; depotDx: number; depotDy: number } {
  const { cx, cy } = unitCenter(entryUnit)
  const footprint = getUnitFootprint(entryUnit)
  const occupied = occupiedCells(line)
  const edgeReach =
    Math.max(footprint.cols, footprint.rows) * 0.5 + DEPOT_EDGE_PADDING

  for (const { vx, vy } of gatherDirectionCandidates(entryUnit, line, index)) {
    const mineralGx = Math.round(cx + vx * MINERAL_DISTANCE_CELLS)
    const mineralGy = Math.round(cy + vy * MINERAL_DISTANCE_CELLS)
    if (occupied.has(`${mineralGx},${mineralGy}`)) continue

    return {
      depotDx: vx * edgeReach,
      depotDy: vy * edgeReach,
      mineralDx: vx * MINERAL_DISTANCE_CELLS,
      mineralDy: vy * MINERAL_DISTANCE_CELLS,
    }
  }

  const fallback = normalizeVector(
    GATHER_DIRECTION_CANDIDATES[index % GATHER_DIRECTION_CANDIDATES.length]!.vx,
    GATHER_DIRECTION_CANDIDATES[index % GATHER_DIRECTION_CANDIDATES.length]!.vy,
  )
  return {
    depotDx: fallback.vx * edgeReach,
    depotDy: fallback.vy * edgeReach,
    mineralDx: fallback.vx * MINERAL_DISTANCE_CELLS,
    mineralDy: fallback.vy * MINERAL_DISTANCE_CELLS,
  }
}

/** 연속투입 — 투입 시간과 무관하게 프로브 2대 교대 */
export const CONTINUOUS_PROBE_COUNT = 2

/** 연속투입 시 고정 투입 간격 (초) */
export const CONTINUOUS_INPUT_INTERVAL_SEC = 4

/** 연속투입 — 시작점 자재 On은 이 슬롯 프로브 내려놓기와 동기화 (0=첫 교대, 1=둘째 교대) */
export const CONTINUOUS_INJECT_PROBE_SLOT = 1

export function resolveGatherInputIntervalSec(
  continuousInputActive: boolean,
  userInputIntervalSec: number,
): number {
  return continuousInputActive ? CONTINUOUS_INPUT_INTERVAL_SEC : userInputIntervalSec
}

/** 투입 시간(초) = 프로브 2대 기준 1회 투입 간격. 비율 합계 1.0 */
const MINING_RATIO = 0.32
const TRAVEL_LEG_RATIO = 0.3
const DEPOSITING_RATIO = 0.08
/** 이동 구간 최소 시간 — 부드러운 가감속 우선 */
const TRAVEL_MIN_MS = 490
const MINING_MIN_MS = 140
const DEPOSITING_MIN_MS = 90
/** 시뮬 틱(500ms) 내부 프로브 진행 단위 — 작을수록 이동이 매끄러움 */
const GATHER_SUBSTEP_MS = 8
/** depositing 진행률 — 시각적 내려놓기와 동일 시점에 투입(On) */
const DEPOSIT_INJECT_RATIO = 0.45

/** @deprecated 연속투입은 항상 {@link CONTINUOUS_PROBE_COUNT}대 */
export const DUAL_PROBE_THRESHOLD_SEC = 2

export function gatherProbeCount(_inputIntervalSec?: number): number {
  return CONTINUOUS_PROBE_COUNT
}

/** 프로브 1대당 1회 투입 간격 (초) */
export function gatherInjectIntervalMs(inputIntervalSec: number): number {
  return Math.max(PATH_SIMULATION_STEP_MS, inputIntervalSec * 1000)
}

/** 한 사이클 = 투입 간격 × 프로브 수(2) */
export function gatherCycleMs(inputIntervalSec: number): number {
  return gatherInjectIntervalMs(inputIntervalSec) * CONTINUOUS_PROBE_COUNT
}

export function gatherEffectiveCycleMs(inputIntervalSec: number): number {
  return gatherCycleMs(inputIntervalSec)
}

export function gatherPhaseDurationsMs(inputIntervalSec: number): {
  toMineral: number
  mining: number
  toDepot: number
  depositing: number
  cycleMs: number
  probeCount: number
  /** 사이클 내 자재 On(투입) 시점 — 내려놓기 연출과 동일 */
  injectAtCycleMs: number
} {
  const probeCount = CONTINUOUS_PROBE_COUNT
  const cycleMs = gatherEffectiveCycleMs(inputIntervalSec)

  let mining = Math.max(MINING_MIN_MS, cycleMs * MINING_RATIO)
  let toMineral = Math.max(TRAVEL_MIN_MS, cycleMs * TRAVEL_LEG_RATIO)
  let toDepot = toMineral
  let depositing = Math.max(DEPOSITING_MIN_MS, cycleMs * DEPOSITING_RATIO)

  const overhead = toMineral + toDepot + mining + depositing
  if (overhead > cycleMs) {
    const scale = cycleMs / overhead
    mining *= scale
    toMineral *= scale
    toDepot *= scale
    depositing *= scale
  }

  const injectAtCycleMs =
    toMineral + mining + toDepot + depositing * DEPOSIT_INJECT_RATIO

  return {
    toMineral,
    mining,
    toDepot,
    depositing,
    cycleMs,
    probeCount,
    injectAtCycleMs,
  }
}

function depositInjectAtMs(depositingMs: number): number {
  if (depositingMs <= 0) return 0
  return Math.max(1, depositingMs * DEPOSIT_INJECT_RATIO)
}

function depositVisualElapsedMs(probe: GatherProbeState, depositingMs: number): number {
  if (probe.phase !== 'depositing') return 0
  return Math.min(probe.phaseElapsedMs, depositingMs)
}

function msUntilInjectAllowed(vacantTicks: number): number {
  const required = continuousEntryVacantTicksRequired()
  const ticksRemaining = Math.max(0, required - vacantTicks)
  return ticksRemaining * PATH_SIMULATION_STEP_MS
}

/** 투입구 도착 시점에 투입 가능할 때만 출발 — 미리 투입구에서 대기하지 않음 */
function canStartToDepot(
  loads: PathSimulationLoad[],
  entryUnitId: string,
  tickVacantByEntry: Record<string, number>,
  _inputIntervalSec: number,
  toDepotMs: number,
): boolean {
  const vacantTicks = resolveEntryVacantTicks(loads, entryUnitId, tickVacantByEntry)
  if (!canInjectAtEntry(loads, entryUnitId, tickVacantByEntry)) return false
  return msUntilInjectAllowed(vacantTicks) <= toDepotMs
}

function holdProbeAtMineral(probe: GatherProbeState, deltaMs: number, miningMs: number): GatherProbeState {
  let phaseElapsedMs = probe.phaseElapsedMs + deltaMs
  if (phaseElapsedMs >= miningMs) {
    phaseElapsedMs %= Math.max(1, miningMs)
  }
  return { ...probe, phase: 'mining', phaseElapsedMs }
}

function probeSpawnsContinuousInject(probe: GatherProbeState): boolean {
  return probe.probeSlot === CONTINUOUS_INJECT_PROBE_SLOT
}

function applyDepositInject(
  probe: GatherProbeState,
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  loadSequence: number,
  tickVacantByEntry: Record<string, number>,
  _inputIntervalSec: number,
): {
  probe: GatherProbeState
  loads: PathSimulationLoad[]
  spawned: PathSimulationLoad[]
  nextSequence: number
} {
  if (!probe.carrying) {
    return { probe, loads, spawned: [], nextSequence: loadSequence }
  }

  if (!probeSpawnsContinuousInject(probe)) {
    return {
      probe: { ...probe, carrying: false, bootstrapFromMining: false },
      loads,
      spawned: [],
      nextSequence: loadSequence,
    }
  }

  const inject = spawnAtEntryIfReady(loads, line, entryUnitId, loadSequence, tickVacantByEntry)
  if (inject.spawned.length === 0) {
    return { probe, loads, spawned: [], nextSequence: loadSequence }
  }

  return {
    probe: { ...probe, carrying: false, bootstrapFromMining: false },
    loads: inject.loads,
    spawned: inject.spawned,
    nextSequence: inject.nextSequence,
  }
}

function tryDepositInjectForProbe(
  probe: GatherProbeState,
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  loadSequence: number,
  depositingMs: number,
  phaseBeforeStep: GatherProbePhase,
  elapsedBeforeStep: number,
  tickVacantByEntry: Record<string, number>,
  inputIntervalSec: number,
): {
  probe: GatherProbeState
  loads: PathSimulationLoad[]
  spawned: PathSimulationLoad[]
  nextSequence: number
} {
  if (
    probe.awaitingEntryClear ||
    probe.phase !== 'depositing' ||
    !probe.carrying
  ) {
    return { probe, loads, spawned: [], nextSequence: loadSequence }
  }

  const injectAtMs = depositInjectAtMs(depositingMs)
  const depositBefore =
    phaseBeforeStep === 'depositing'
      ? Math.min(elapsedBeforeStep, depositingMs)
      : 0
  const depositAfter = depositVisualElapsedMs(probe, depositingMs)
  const crossedInject = depositBefore < injectAtMs && depositAfter >= injectAtMs
  const missedInject =
    depositBefore < injectAtMs &&
    depositAfter >= depositingMs &&
    probe.carrying

  if (!crossedInject && !missedInject) {
    return { probe, loads, spawned: [], nextSequence: loadSequence }
  }

  const inject = applyDepositInject(
    probe,
    loads,
    line,
    entryUnitId,
    loadSequence,
    tickVacantByEntry,
    inputIntervalSec,
  )
  return {
    probe: inject.probe,
    loads: inject.loads,
    spawned: inject.spawned,
    nextSequence: inject.nextSequence,
  }
}

function finishDepositingPhase(
  probe: GatherProbeState,
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  loadSequence: number,
  tickVacantByEntry: Record<string, number>,
  inputIntervalSec: number,
): {
  probe: GatherProbeState
  loads: PathSimulationLoad[]
  spawned: PathSimulationLoad[]
  nextSequence: number
} {
  if (probe.carrying) {
    return completeDepositingPhase(
      probe,
      loads,
      line,
      entryUnitId,
      loadSequence,
      tickVacantByEntry,
      inputIntervalSec,
    )
  }

  return {
    probe: {
      ...probe,
      phase: 'toMineral',
      phaseElapsedMs: 0,
      carrying: false,
      bootstrapFromMining: false,
    },
    loads,
    spawned: [],
    nextSequence: loadSequence,
  }
}
function completeDepositingPhase(
  probe: GatherProbeState,
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  loadSequence: number,
  tickVacantByEntry: Record<string, number>,
  inputIntervalSec: number,
): {
  probe: GatherProbeState
  loads: PathSimulationLoad[]
  spawned: PathSimulationLoad[]
  nextSequence: number
} {
  let nextProbe = probe
  let nextLoads = loads
  let nextSequence = loadSequence
  const batchSpawned: PathSimulationLoad[] = []

  if (nextProbe.carrying) {
    const inject = applyDepositInject(
      nextProbe,
      nextLoads,
      line,
      entryUnitId,
      nextSequence,
      tickVacantByEntry,
      inputIntervalSec,
    )
    nextProbe = inject.probe
    nextLoads = inject.loads
    nextSequence = inject.nextSequence
    batchSpawned.push(...inject.spawned)
  }

  if (nextProbe.carrying) {
    nextProbe = {
      ...nextProbe,
      phase: 'mining',
      phaseElapsedMs: 0,
      carrying: true,
    }
  } else {
    nextProbe = {
      ...nextProbe,
      phase: 'toMineral',
      phaseElapsedMs: 0,
      carrying: false,
      bootstrapFromMining: false,
    }
  }

  return {
    probe: nextProbe,
    loads: nextLoads,
    spawned: batchSpawned,
    nextSequence,
  }
}
export function gatherPhaseTickBudget(inputIntervalSec: number): {
  toMineral: number
  mining: number
  toDepot: number
} {
  const durations = gatherPhaseDurationsMs(inputIntervalSec)
  const step = PATH_SIMULATION_STEP_MS
  return {
    toMineral: Math.max(1, Math.ceil(durations.toMineral / step)),
    mining: Math.max(1, Math.ceil(durations.mining / step)),
    toDepot: Math.max(1, Math.ceil(durations.toDepot / step)),
  }
}

/** 사이클 오프셋 → phase (교대 투입용 초기 배치) */
function probeAtCycleOffset(
  offsetMs: number,
  durations: ReturnType<typeof gatherPhaseDurationsMs>,
): Pick<GatherProbeState, 'phase' | 'phaseElapsedMs' | 'carrying'> {
  const { mining, toDepot, depositing, cycleMs } = durations
  const t = ((offsetMs % cycleMs) + cycleMs) % cycleMs

  let cursor = 0
  if (t < cursor + mining) {
    return { phase: 'mining', phaseElapsedMs: t - cursor, carrying: false }
  }
  cursor += mining
  if (t < cursor + toDepot) {
    return { phase: 'toDepot', phaseElapsedMs: t - cursor, carrying: true }
  }
  cursor += toDepot
  if (t < cursor + depositing) {
    return { phase: 'depositing', phaseElapsedMs: t - cursor, carrying: true }
  }
  cursor += depositing
  return { phase: 'toMineral', phaseElapsedMs: t - cursor, carrying: false }
}

export function initGatherProbes(
  line: ConveyorLine,
  entryUnitIds: string[],
  inputIntervalSec: number,
): GatherProbeState[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const durations = gatherPhaseDurationsMs(inputIntervalSec)
  const staggerMs = gatherInjectIntervalMs(inputIntervalSec)
  const probes: GatherProbeState[] = []

  for (const [index, entryUnitId] of entryUnitIds.entries()) {
    const unit = unitMap.get(entryUnitId)
    if (!unit) continue
    const layout = pickGatherLayout(unit, line, index)

    for (let slot = 0; slot < CONTINUOUS_PROBE_COUNT; slot += 1) {
      const offset = slot * staggerMs
      const cyclePose = probeAtCycleOffset(offset, durations)
      probes.push({
        entryUnitId,
        probeSlot: slot,
        phase: 'mining',
        phaseElapsedMs: cyclePose.phaseElapsedMs % Math.max(1, durations.mining),
        mineralDx: layout.mineralDx,
        mineralDy: layout.mineralDy,
        depotDx: layout.depotDx,
        depotDy: layout.depotDy,
        carrying: false,
        awaitingEntryClear: true,
        bootstrapFromMining: true,
      })
    }
  }
  return probes
}

function advanceProbeByDelta(
  probe: GatherProbeState,
  deltaMs: number,
  durations: ReturnType<typeof gatherPhaseDurationsMs>,
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  loadSequence: number,
  tickVacantByEntry: Record<string, number>,
  inputIntervalSec: number,
): {
  probe: GatherProbeState
  loads: PathSimulationLoad[]
  spawned: PathSimulationLoad[]
  nextSequence: number
} {
  const spawned: PathSimulationLoad[] = []
  let nextSequence = loadSequence

  const phaseBeforeStep = probe.phase
  const elapsedBeforeStep = probe.phaseElapsedMs
  let next: GatherProbeState = { ...probe, phaseElapsedMs: probe.phaseElapsedMs + deltaMs }

  if (next.phase === 'toMineral' && next.phaseElapsedMs >= durations.toMineral) {
    next = {
      ...next,
      phase: 'mining',
      phaseElapsedMs: next.phaseElapsedMs - durations.toMineral,
      carrying: false,
      bootstrapFromMining: false,
    }
  }

  if (next.phase === 'toDepot' && next.phaseElapsedMs >= durations.toDepot) {
    const injectReady = canInjectAtEntry(loads, entryUnitId, tickVacantByEntry)
    if (injectReady) {
      next = {
        ...next,
        phase: 'depositing',
        phaseElapsedMs: next.phaseElapsedMs - durations.toDepot,
        carrying: true,
      }
    } else {
      next = {
        ...next,
        phase: 'mining',
        phaseElapsedMs: 0,
        carrying: true,
      }
    }
  }

  if (next.phase === 'depositing') {
    const injected = tryDepositInjectForProbe(
      next,
      loads,
      line,
      entryUnitId,
      nextSequence,
      durations.depositing,
      phaseBeforeStep,
      elapsedBeforeStep,
      tickVacantByEntry,
      inputIntervalSec,
    )
    next = injected.probe
    loads = injected.loads
    spawned.push(...injected.spawned)
    nextSequence = injected.nextSequence

    if (next.phase === 'depositing' && next.phaseElapsedMs >= durations.depositing) {
      const finished = finishDepositingPhase(
        next,
        loads,
        line,
        entryUnitId,
        nextSequence,
        tickVacantByEntry,
        inputIntervalSec,
      )
      next = finished.probe
      loads = finished.loads
      spawned.push(...finished.spawned)
      nextSequence = finished.nextSequence
    }

    return { probe: next, loads, spawned, nextSequence }
  }

  if (next.phase === 'mining' || next.awaitingEntryClear) {
    next = { ...next, phase: 'mining' as const }

    const entryClear = isEntryUnoccupied(loads, entryUnitId)
    const readyToDepart =
      entryClear &&
      canStartToDepot(loads, entryUnitId, tickVacantByEntry, inputIntervalSec, durations.toDepot)

    if (next.carrying && readyToDepart) {
      return {
        probe: {
          ...next,
          awaitingEntryClear: false,
          phase: 'toDepot',
          phaseElapsedMs: 0,
          carrying: true,
          bootstrapFromMining: false,
        },
        loads,
        spawned,
        nextSequence,
      }
    }

    if (!next.carrying && next.phaseElapsedMs >= durations.mining) {
      if (readyToDepart) {
        return {
          probe: {
            ...next,
            awaitingEntryClear: false,
            phase: 'toDepot',
            phaseElapsedMs: next.phaseElapsedMs - durations.mining,
            carrying: true,
            bootstrapFromMining: false,
          },
          loads,
          spawned,
          nextSequence,
        }
      }
      next = holdProbeAtMineral(next, 0, durations.mining)
      if (entryClear) {
        next = { ...next, awaitingEntryClear: false, bootstrapFromMining: probe.bootstrapFromMining }
      }
      return { probe: next, loads, spawned, nextSequence }
    }

    if (next.carrying) {
      return { probe: holdProbeAtMineral(next, 0, durations.mining), loads, spawned, nextSequence }
    }

    if (entryClear) {
      next = { ...next, awaitingEntryClear: false }
    }
    return { probe: next, loads, spawned, nextSequence }
  }

  return { probe: next, loads, spawned, nextSequence }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t))
}

/** 부드러운 가감속 (smootherstep) */
function easeSmooth(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10)
}

/** 이동 구간 — 코사인 가감속 중심 (급가속·급정거 최소화) */
function easeTravel(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  const sine = 0.5 - Math.cos(Math.PI * clamped) / 2
  const smooth = clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10)
  return sine * 0.86 + smooth * 0.14
}

function phaseProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1
  return easeSmooth(elapsedMs / durationMs)
}

function travelProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1
  return easeTravel(elapsedMs / durationMs)
}

function phaseDurationMs(
  phase: GatherProbePhase,
  durations: ReturnType<typeof gatherPhaseDurationsMs>,
): number {
  switch (phase) {
    case 'toMineral':
      return durations.toMineral
    case 'mining':
      return durations.mining
    case 'toDepot':
      return durations.toDepot
    case 'depositing':
      return durations.depositing
    default:
      return 0
  }
}

function visualElapsedMs(
  phase: GatherProbePhase,
  phaseElapsedMs: number,
  extraElapsedMs: number,
  durations: ReturnType<typeof gatherPhaseDurationsMs>,
): number {
  const duration = phaseDurationMs(phase, durations)
  return Math.min(phaseElapsedMs + extraElapsedMs, duration)
}

function layoutPoints(
  unit: ConveyorUnit,
  probe: GatherProbeState,
  cellSize: number,
  minX: number,
  minY: number,
): { depotX: number; depotY: number; mineralX: number; mineralY: number } {
  const { cx, cy } = unitCenter(unit)
  const centerX = (cx - minX) * cellSize
  const centerY = (cy - minY) * cellSize
  return {
    depotX: centerX + probe.depotDx * cellSize,
    depotY: centerY + probe.depotDy * cellSize,
    mineralX: centerX + probe.mineralDx * cellSize,
    mineralY: centerY + probe.mineralDy * cellSize,
  }
}

export function gatherProbeVisuals(
  probes: GatherProbeState[],
  line: ConveyorLine,
  cellSize: number,
  minX: number,
  minY: number,
  inputIntervalSec: number,
  extraElapsedMs = 0,
): GatherProbeVisual[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const durations = gatherPhaseDurationsMs(inputIntervalSec)

  return probes.flatMap((probe) => {
    const unit = unitMap.get(probe.entryUnitId)
    if (!unit) return []

    const { depotX, depotY, mineralX, mineralY } = layoutPoints(
      unit,
      probe,
      cellSize,
      minX,
      minY,
    )

    const elapsed = visualElapsedMs(
      probe.phase,
      probe.phaseElapsedMs,
      extraElapsedMs,
      durations,
    )
    let probeX = depotX
    let probeY = depotY
    let carrying = probe.carrying
    let carriedMineralX: number | null = null
    let carriedMineralY: number | null = null
    let travelT = 0

    if (probe.phase === 'toMineral') {
      travelT = travelProgress(elapsed, durations.toMineral)
      probeX = lerp(depotX, mineralX, travelT)
      probeY = lerp(depotY, mineralY, travelT)
      carrying = false
    } else if (probe.phase === 'mining') {
      probeX = mineralX
      probeY = mineralY
      carrying = probe.carrying
      travelT = phaseProgress(elapsed, durations.mining)
      if (probe.carrying) {
        const carryBob = Math.sin(travelT * Math.PI * 2) * cellSize * 0.02
        carriedMineralX = probeX
        carriedMineralY = probeY - cellSize * 0.14 + carryBob
      }
    } else if (probe.phase === 'toDepot') {
      travelT = travelProgress(elapsed, durations.toDepot)
      probeX = lerp(mineralX, depotX, travelT)
      probeY = lerp(mineralY, depotY, travelT)
      carrying = true
      const carryBob = Math.sin(travelT * Math.PI) * cellSize * 0.022
      carriedMineralX = probeX
      carriedMineralY = probeY - cellSize * 0.14 + carryBob
    } else if (probe.phase === 'depositing') {
      travelT = phaseProgress(elapsed, durations.depositing)
      const settleT = easeSmooth(Math.min(1, travelT / 0.55))
      const releaseT = easeSmooth(Math.max(0, (travelT - 0.45) / 0.55))
      const depotRestX = depotX - (mineralX - depotX) * 0.05
      const depotRestY = depotY - (mineralY - depotY) * 0.05

      probeX = lerp(depotX, depotRestX, releaseT * 0.4)
      probeY = lerp(depotY, depotRestY, releaseT * 0.4)
      carrying = probe.carrying

      if (probe.carrying) {
        carriedMineralX = lerp(probeX, depotX, settleT)
        carriedMineralY = lerp(probeY - cellSize * 0.14, depotY - cellSize * 0.08, settleT)
      }
    }

    const travelDx = mineralX - depotX
    const travelDy = mineralY - depotY
    const travelLen = Math.hypot(travelDx, travelDy) || 1
    const laneSign = probe.probeSlot === 0 ? -1 : 1
    const laneOffset = cellSize * 0.11 * laneSign
    const laneX = (-travelDy / travelLen) * laneOffset
    const laneY = (travelDx / travelLen) * laneOffset
    probeX += laneX
    probeY += laneY
    if (carriedMineralX != null && carriedMineralY != null) {
      carriedMineralX += laneX
      carriedMineralY += laneY
    }

    return [
      {
        entryUnitId: probe.entryUnitId,
        probeSlot: probe.probeSlot,
        depotX,
        depotY,
        mineralX,
        mineralY,
        probeX,
        probeY,
        carriedMineralX,
        carriedMineralY,
        carrying,
        phase: probe.phase,
        travelT,
      },
    ]
  })
}

export function cloneGatherProbes(probes: GatherProbeState[]): GatherProbeState[] {
  return probes.map((probe) => ({ ...probe }))
}

function blendGatherProbeVisuals(
  from: GatherProbeVisual[],
  to: GatherProbeVisual[],
  alpha: number,
): GatherProbeVisual[] {
  const fromMap = new Map(from.map((v) => [`${v.entryUnitId}:${v.probeSlot}`, v]))
  return to.map((toV) => {
    const fromV = fromMap.get(`${toV.entryUnitId}:${toV.probeSlot}`)
    if (!fromV || alpha <= 0) return fromV ?? toV
    if (alpha >= 1) return toV
    const lerpNullable = (a: number | null, b: number | null): number | null => {
      if (a != null && b != null) return lerp(a, b, alpha)
      return alpha < 0.5 ? a : b
    }
    return {
      ...toV,
      probeX: lerp(fromV.probeX, toV.probeX, alpha),
      probeY: lerp(fromV.probeY, toV.probeY, alpha),
      carriedMineralX: lerpNullable(fromV.carriedMineralX, toV.carriedMineralX),
      carriedMineralY: lerpNullable(fromV.carriedMineralY, toV.carriedMineralY),
      travelT: lerp(fromV.travelT, toV.travelT, alpha),
    }
  })
}

/**
 * 틱 시작→종료 보간. 시뮬 결과(tickEnd)와 선형 extrapol(tickStart+p) 사이를 블렌딩해
 * phase 전환·틱 경계에서의 끊김을 줄인다.
 */
export function gatherProbeVisualsSmooth(
  tickStartProbes: GatherProbeState[],
  tickEndProbes: GatherProbeState[],
  line: ConveyorLine,
  cellSize: number,
  minX: number,
  minY: number,
  inputIntervalSec: number,
  tickProgressMs: number,
): GatherProbeVisual[] {
  const step = PATH_SIMULATION_STEP_MS
  const progress = Math.min(step, Math.max(0, tickProgressMs))
  const alpha = easeSmooth(progress / step)
  const fromVisuals = gatherProbeVisuals(
    tickStartProbes,
    line,
    cellSize,
    minX,
    minY,
    inputIntervalSec,
    progress,
  )
  if (tickEndProbes.length === 0 || alpha <= 0) {
    return fromVisuals
  }
  const toVisuals = gatherProbeVisuals(
    tickEndProbes,
    line,
    cellSize,
    minX,
    minY,
    inputIntervalSec,
    0,
  )
  if (alpha >= 1) {
    return toVisuals
  }
  return blendGatherProbeVisuals(fromVisuals, toVisuals, alpha)
}

export interface AdvanceGatherProbesResult {
  probes: GatherProbeState[]
  spawned: PathSimulationLoad[]
  nextSequence: number
  entryVacantTicks: Record<string, number>
}

function spawnAtEntryIfReady(
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  loadSequence: number,
  tickVacantByEntry: Record<string, number>,
): { loads: PathSimulationLoad[]; spawned: PathSimulationLoad[]; nextSequence: number } {
  if (!canInjectAtEntry(loads, entryUnitId, tickVacantByEntry)) {
    return { loads, spawned: [], nextSequence: loadSequence }
  }

  const batch = spawnInboundSimulationLoads(line, [entryUnitId], loadSequence + 1)
  if (batch.length === 0) {
    return { loads, spawned: [], nextSequence: loadSequence }
  }

  return {
    loads: [...loads, ...batch],
    spawned: batch,
    nextSequence: loadSequence + 1,
  }
}

export function advanceGatherProbes(
  probes: GatherProbeState[],
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitIds: string[],
  inputIntervalSec: number,
  loadSequence: number,
  entryVacantTicks: Record<string, number>,
): AdvanceGatherProbesResult {
  if (entryUnitIds.length === 0) {
    return { probes: [], spawned: [], nextSequence: loadSequence, entryVacantTicks: {} }
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const durations = gatherPhaseDurationsMs(inputIntervalSec)
  const vacantTicksByEntry = tickAllEntryVacancy(loads, entryUnitIds, entryVacantTicks)
  const probeByKey = new Map(
    probes.map((probe) => [`${probe.entryUnitId}:${probe.probeSlot}`, { ...probe }]),
  )
  const spawned: PathSimulationLoad[] = []
  let nextSequence = loadSequence
  const stepMs = PATH_SIMULATION_STEP_MS

  for (let index = 0; index < entryUnitIds.length; index += 1) {
    const entryUnitId = entryUnitIds[index]!

    for (let slot = 0; slot < CONTINUOUS_PROBE_COUNT; slot += 1) {
      const probeKey = `${entryUnitId}:${slot}`
      let probe = probeByKey.get(probeKey)
      if (!probe) {
        const unit = unitMap.get(entryUnitId)
        if (!unit) continue
        const layout = pickGatherLayout(unit, line, index)
        probe = {
          entryUnitId,
          probeSlot: slot,
          phase: 'mining',
          phaseElapsedMs: 0,
          mineralDx: layout.mineralDx,
          mineralDy: layout.mineralDy,
          depotDx: layout.depotDx,
          depotDy: layout.depotDy,
          carrying: false,
          awaitingEntryClear: true,
          bootstrapFromMining: true,
        }
      }

      for (let sub = 0; sub < stepMs; sub += GATHER_SUBSTEP_MS) {
        const delta = Math.min(GATHER_SUBSTEP_MS, stepMs - sub)
        const stepped = advanceProbeByDelta(
          probe,
          delta,
          durations,
          loads,
          line,
          entryUnitId,
          nextSequence,
          vacantTicksByEntry,
          inputIntervalSec,
        )
        probe = stepped.probe
        loads = stepped.loads
        spawned.push(...stepped.spawned)
        nextSequence = stepped.nextSequence
      }

      probeByKey.set(probeKey, probe)
    }
  }

  const orderedProbes = entryUnitIds.flatMap((entryUnitId) =>
    Array.from({ length: CONTINUOUS_PROBE_COUNT }, (_, slot) =>
      probeByKey.get(`${entryUnitId}:${slot}`),
    ).filter((probe): probe is GatherProbeState => probe != null),
  )

  return { probes: orderedProbes, spawned, nextSequence, entryVacantTicks: vacantTicksByEntry }
}

/** 한 틱당 수집 애니메이션 진행 시간(초) */
export function gatherTickSeconds(): number {
  return PATH_SIMULATION_STEP_MS / 1000
}
