import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { PathSimulationLoad } from '../types/unitProperties'
import { PATH_SIMULATION_STEP_MS } from '../types/unitProperties'
import { dirToward } from './flowDirection'
import { getFootprintCells, getUnitFootprint } from './unitFootprint'
import {
  planInboundLoadPath,
  spawnContinuousInjectLoad,
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

function isEntryOccupiedByLoad(
  loads: PathSimulationLoad[],
  entryUnitId: string,
): boolean {
  return loads.some((load) => {
    if (load.complete || load.pathUnitIds.length === 0) return false
    if (load.entryUnitId !== entryUnitId) return false

    const step = Math.min(
      Math.max(0, load.stepIndex),
      load.pathUnitIds.length - 1,
    )
    const entryIndex = load.pathUnitIds.indexOf(entryUnitId)
    if (entryIndex < 0) {
      return step === 0
    }
    return step <= entryIndex
  })
}

function isEntryUnoccupied(
  loads: PathSimulationLoad[],
  _line: ConveyorLine,
  entryUnitId: string,
): boolean {
  return !isEntryOccupiedByLoad(loads, entryUnitId)
}

/** 내려놓기 시점 — 시작점 비었고 투입 경로가 있을 때만 투입 */
function canProbeDepositInjectNow(
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  destinationUnitId?: string | null,
): boolean {
  if (!isEntryUnoccupied(loads, line, entryUnitId)) return false
  const plan = planInboundLoadPath(line, entryUnitId, destinationUnitId)
  return plan.pathUnitIds.length > 0
}

function markEntryOccupied(
  tickVacantByEntry: Record<string, number>,
  entryUnitId: string,
): void {
  tickVacantByEntry[entryUnitId] = 0
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
  /** 투입구 핸드오프·틱 보간 시 미네랄 페이드 */
  carriedMineralOpacity: number
  carrying: boolean
  phase: GatherProbePhase
  travelT: number
}

/** 프로브 위 미네랄 Y 오프셋 (cellSize 배수) */
const MINERAL_CARRY_OFFSET = 0.14

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

/** 연속투입 시 고정 투입 간격 (초) — 프로브 2대 교대 간격 */
export const CONTINUOUS_INPUT_INTERVAL_SEC = 4

/** 프로브 1대 왕복 사이클(초) = 교대 간격 × 프로브 수 */
export const CONTINUOUS_PROBE_CYCLE_SEC =
  CONTINUOUS_INPUT_INTERVAL_SEC * CONTINUOUS_PROBE_COUNT

function roundToGatherTick(ms: number): number {
  return Math.max(
    PATH_SIMULATION_STEP_MS,
    Math.round(ms / PATH_SIMULATION_STEP_MS) * PATH_SIMULATION_STEP_MS,
  )
}

export function resolveGatherInputIntervalSec(
  continuousInputActive: boolean,
  userInputIntervalSec: number,
): number {
  return continuousInputActive ? CONTINUOUS_INPUT_INTERVAL_SEC : userInputIntervalSec
}

/** 투입 시간(초) = 프로브 2대 기준 1회 투입 간격. 비율 합계 1.0 */
/** 광맥 복귀·채굴 — 사이클 전반부 */
const RETURN_MINERAL_RATIO = 0.3
/** 시뮬 틱 내부 프로브 진행 단위 */
const GATHER_SUBSTEP_MS = 10

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
  staggerMs: number
  probeCount: number
  /** 사이클 내 투입 시점 — toMineral + mining + toDepot */
  injectAtCycleMs: number
} {
  const probeCount = CONTINUOUS_PROBE_COUNT
  const staggerMs = gatherInjectIntervalMs(inputIntervalSec)
  const cycleMs = staggerMs * probeCount
  const halfCycle = cycleMs / probeCount

  // 후반부 전체 = 투입구 이동·투입 → 교대 간격의 절반마다 1대가 도착
  const toDepot = roundToGatherTick(halfCycle)
  const toMineral = roundToGatherTick(halfCycle * RETURN_MINERAL_RATIO)
  const mining = roundToGatherTick(halfCycle - toMineral)

  const injectAtCycleMs = toMineral + mining + toDepot

  return {
    toMineral,
    mining,
    toDepot,
    depositing: 0,
    cycleMs,
    staggerMs,
    probeCount,
    injectAtCycleMs,
  }
}

function holdProbeAtMineral(
  probe: GatherProbeState,
  miningMs: number,
  carrying: boolean,
): GatherProbeState {
  return {
    ...probe,
    phase: 'mining',
    phaseElapsedMs: miningMs,
    carrying,
  }
}

/** 투입 실패 시 광맥 복귀 대신 투입구에서 대기 */
function holdProbeAtDepot(
  probe: GatherProbeState,
  toDepotMs: number,
): GatherProbeState {
  return {
    ...probe,
    phase: 'toDepot',
    phaseElapsedMs: toDepotMs,
    carrying: true,
  }
}

/** 투입구 도착 — 실제 투입 성공 시에만 자재 제거, 실패 시 투입구 대기 */
function attemptProbeDepotInject(
  probe: GatherProbeState,
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  loadSequence: number,
  tickVacantByEntry: Record<string, number>,
  toDepotMs: number,
  destinationUnitId?: string | null,
): {
  probe: GatherProbeState
  loads: PathSimulationLoad[]
  spawned: PathSimulationLoad[]
  nextSequence: number
} {
  if (!probe.carrying) {
    return {
      probe: {
        ...probe,
        phase: 'toMineral',
        phaseElapsedMs: 0,
        carrying: false,
      },
      loads,
      spawned: [],
      nextSequence: loadSequence,
    }
  }

  if (!canProbeDepositInjectNow(loads, line, entryUnitId, destinationUnitId)) {
    return {
      probe: holdProbeAtDepot(probe, toDepotMs),
      loads,
      spawned: [],
      nextSequence: loadSequence,
    }
  }

  const inject = applyDepositInject(
    probe,
    loads,
    line,
    entryUnitId,
    loadSequence,
    tickVacantByEntry,
    0,
    destinationUnitId,
  )

  if (inject.spawned.length > 0) {
    return {
      probe: {
        ...inject.probe,
        phase: 'toMineral',
        phaseElapsedMs: 0,
        carrying: false,
      },
      loads: inject.loads,
      spawned: inject.spawned,
      nextSequence: inject.nextSequence,
    }
  }

  return {
    probe: holdProbeAtDepot(probe, toDepotMs),
    loads: inject.loads,
    spawned: [],
    nextSequence: inject.nextSequence,
  }
}

function applyDepositInject(
  probe: GatherProbeState,
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitId: string,
  loadSequence: number,
  tickVacantByEntry: Record<string, number>,
  _inputIntervalSec: number,
  destinationUnitId?: string | null,
): {
  probe: GatherProbeState
  loads: PathSimulationLoad[]
  spawned: PathSimulationLoad[]
  nextSequence: number
} {
  if (!probe.carrying) {
    return { probe, loads, spawned: [], nextSequence: loadSequence }
  }

  const inject = spawnAtEntryIfReady(
    loads,
    line,
    entryUnitId,
    loadSequence,
    tickVacantByEntry,
    destinationUnitId,
  )
  if (inject.spawned.length === 0) {
    return { probe, loads, spawned: [], nextSequence: loadSequence }
  }

  return {
    probe: { ...probe, carrying: false },
    loads: inject.loads,
    spawned: inject.spawned,
    nextSequence: inject.nextSequence,
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

/** 사이클 오프셋 → phase (FSM 순서: toMineral → mining → toDepot → 투입) */
function probeAtCycleOffset(
  offsetMs: number,
  durations: ReturnType<typeof gatherPhaseDurationsMs>,
): Pick<GatherProbeState, 'phase' | 'phaseElapsedMs' | 'carrying'> {
  const { mining, toDepot, toMineral, cycleMs } = durations
  const t = ((offsetMs % cycleMs) + cycleMs) % cycleMs

  let cursor = 0
  if (t < cursor + toMineral) {
    return { phase: 'toMineral', phaseElapsedMs: t - cursor, carrying: false }
  }
  cursor += toMineral
  if (t < cursor + mining) {
    return { phase: 'mining', phaseElapsedMs: t - cursor, carrying: false }
  }
  cursor += mining
  if (t < cursor + toDepot) {
    return { phase: 'toDepot', phaseElapsedMs: t - cursor, carrying: true }
  }
  return { phase: 'toMineral', phaseElapsedMs: 0, carrying: false }
}

/** 2대 교대 — 0번 투입구 출발, 1번 반 사이클 뒤(광맥 복귀) */
function gatherProbeInitOffsetMs(
  slot: number,
  durations: ReturnType<typeof gatherPhaseDurationsMs>,
): number {
  if (slot === 0) {
    return durations.toMineral + durations.mining
  }
  return 0
}

export function initGatherProbes(
  line: ConveyorLine,
  entryUnitIds: string[],
  inputIntervalSec: number,
): GatherProbeState[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const durations = gatherPhaseDurationsMs(inputIntervalSec)
  const probes: GatherProbeState[] = []

  for (const [index, entryUnitId] of entryUnitIds.entries()) {
    const unit = unitMap.get(entryUnitId)
    if (!unit) continue
    if (unit.interfaceUnit != null) continue
    const layout = pickGatherLayout(unit, line, index)

    for (let slot = 0; slot < CONTINUOUS_PROBE_COUNT; slot += 1) {
      const offset = gatherProbeInitOffsetMs(slot, durations)
      const cyclePose = probeAtCycleOffset(offset, durations)
      probes.push({
        entryUnitId,
        probeSlot: slot,
        phase: cyclePose.phase,
        phaseElapsedMs: cyclePose.phaseElapsedMs,
        mineralDx: layout.mineralDx,
        mineralDy: layout.mineralDy,
        depotDx: layout.depotDx,
        depotDy: layout.depotDy,
        carrying: cyclePose.carrying,
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
  _inputIntervalSec: number,
  destinationUnitId?: string | null,
): {
  probe: GatherProbeState
  loads: PathSimulationLoad[]
  spawned: PathSimulationLoad[]
  nextSequence: number
} {
  const spawned: PathSimulationLoad[] = []
  let nextSequence = loadSequence

  if (probe.phase === 'depositing') {
    probe = holdProbeAtDepot(probe, durations.toDepot)
  }

  let next: GatherProbeState = { ...probe, phaseElapsedMs: probe.phaseElapsedMs + deltaMs }

  if (next.phase === 'toMineral' && next.phaseElapsedMs >= durations.toMineral) {
    next = {
      ...next,
      phase: 'mining',
      phaseElapsedMs: next.phaseElapsedMs - durations.toMineral,
      carrying: false,
    }
  }

  if (next.phase === 'toDepot' && next.phaseElapsedMs >= durations.toDepot) {
    const injected = attemptProbeDepotInject(
      next,
      loads,
      line,
      entryUnitId,
      nextSequence,
      tickVacantByEntry,
      durations.toDepot,
      destinationUnitId,
    )
    spawned.push(...injected.spawned)
    return {
      probe: injected.probe,
      loads: injected.loads,
      spawned,
      nextSequence: injected.nextSequence,
    }
  }

  if (next.phase === 'mining') {
    const entryClear = isEntryUnoccupied(loads, line, entryUnitId)

    if (!next.carrying && next.phaseElapsedMs >= durations.mining) {
      next = holdProbeAtMineral(next, durations.mining, true)
    } else if (next.carrying) {
      next = holdProbeAtMineral(next, durations.mining, true)
    }

    if (next.carrying && entryClear) {
      return {
        probe: {
          ...next,
          phase: 'toDepot',
          phaseElapsedMs: 0,
          carrying: true,
        },
        loads,
        spawned,
        nextSequence,
      }
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

/** 이동 구간 — 등속(선형). 끝에서 빨려 들어가는 느낌을 줄임 */
function easeTravel(t: number): number {
  return Math.min(1, Math.max(0, t))
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
    let carriedMineralOpacity = 1
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
        carriedMineralY = probeY - cellSize * MINERAL_CARRY_OFFSET + carryBob
      }
    } else if (probe.phase === 'toDepot') {
      travelT = travelProgress(elapsed, durations.toDepot)
      probeX = lerp(mineralX, depotX, travelT)
      probeY = lerp(mineralY, depotY, travelT)
      carrying = probe.carrying
      if (probe.carrying) {
        carriedMineralX = probeX
        carriedMineralY = probeY - cellSize * MINERAL_CARRY_OFFSET
      }
    } else if (probe.phase === 'depositing') {
      travelT = 1
      probeX = depotX
      probeY = depotY
      carrying = probe.carrying
      if (probe.carrying) {
        carriedMineralX = probeX
        carriedMineralY = probeY - cellSize * MINERAL_CARRY_OFFSET
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
        carriedMineralOpacity,
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
    const injectHandoffBlend =
      fromV.carrying &&
      fromV.phase === 'toDepot' &&
      toV.phase === 'toMineral' &&
      fromV.carriedMineralX != null &&
      fromV.carriedMineralY != null
    const lerpCarried = (
      a: number | null,
      b: number | null,
      handoff: number,
    ): number | null => {
      if (a != null && b != null) return lerp(a, b, alpha)
      if (a != null && b == null) {
        if (injectHandoffBlend) return lerp(a, handoff, alpha)
        return alpha < 0.92 ? a : b
      }
      if (a == null && b != null) return alpha > 0.08 ? b : a
      return null
    }
    const handoffX = toV.carriedMineralX ?? fromV.carriedMineralX ?? toV.depotX
    const handoffY = toV.carriedMineralY ?? fromV.carriedMineralY ?? toV.depotY
    return {
      ...toV,
      probeX: lerp(fromV.probeX, toV.probeX, alpha),
      probeY: lerp(fromV.probeY, toV.probeY, alpha),
      carriedMineralX: lerpCarried(fromV.carriedMineralX, toV.carriedMineralX, handoffX),
      carriedMineralY: lerpCarried(fromV.carriedMineralY, toV.carriedMineralY, handoffY),
      carriedMineralOpacity: injectHandoffBlend
        ? 1
        : lerp(fromV.carriedMineralOpacity, toV.carriedMineralOpacity, alpha),
      travelT: lerp(fromV.travelT, toV.travelT, alpha),
    }
  })
}

/** 투입 성공 틱 — toDepot(운반) → toMineral(비운반) 전환 */
export function isGatherInjectTransition(
  tickStartProbes: GatherProbeState[],
  tickEndProbes: GatherProbeState[],
): boolean {
  const endByKey = new Map(
    tickEndProbes.map((probe) => [`${probe.entryUnitId}:${probe.probeSlot}`, probe]),
  )
  return tickStartProbes.some((start) => {
    if (start.phase !== 'toDepot' || !start.carrying) return false
    const end = endByKey.get(`${start.entryUnitId}:${start.probeSlot}`)
    return end?.phase === 'toMineral' && !end.carrying
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
  const alpha = progress / step
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
  if (isGatherInjectTransition(tickStartProbes, tickEndProbes)) {
    const fromByKey = new Map(
      fromVisuals.map((visual) => [`${visual.entryUnitId}:${visual.probeSlot}`, visual]),
    )
    return toVisuals.map((toV) => {
      const fromV = fromByKey.get(`${toV.entryUnitId}:${toV.probeSlot}`)
      if (!fromV) return toV
      // travelT=1.0(depot hold 상태)일 때도 fromV를 유지해 미네랄이 순간 사라지는 현상 방지
      return fromV
    })
  }
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
  destinationUnitId?: string | null,
): { loads: PathSimulationLoad[]; spawned: PathSimulationLoad[]; nextSequence: number } {
  if (!canProbeDepositInjectNow(loads, line, entryUnitId, destinationUnitId)) {
    return { loads, spawned: [], nextSequence: loadSequence }
  }

  const nextSeq = loadSequence + 1
  const batchLoad = spawnContinuousInjectLoad(
    line,
    entryUnitId,
    nextSeq,
    destinationUnitId,
  )
  if (!batchLoad) {
    return { loads, spawned: [], nextSequence: loadSequence }
  }

  markEntryOccupied(tickVacantByEntry, entryUnitId)

  return {
    loads: [...loads, batchLoad],
    spawned: [batchLoad],
    nextSequence: nextSeq,
  }
}

function finalizeEntryVacantTicks(
  loads: PathSimulationLoad[],
  entryUnitIds: string[],
  tickStartVacancy: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const entryUnitId of entryUnitIds) {
    if (isEntryOccupiedByLoad(loads, entryUnitId)) {
      next[entryUnitId] = 0
      continue
    }
    next[entryUnitId] = tickEntryVacancy(entryUnitId, loads, {
      vacantTicks: tickStartVacancy[entryUnitId] ?? 0,
    }).vacantTicks
  }
  return next
}

export function advanceGatherProbes(
  probes: GatherProbeState[],
  loads: PathSimulationLoad[],
  line: ConveyorLine,
  entryUnitIds: string[],
  inputIntervalSec: number,
  loadSequence: number,
  entryVacantTicks: Record<string, number>,
  destinationUnitIdByEntry: Record<string, string> = {},
): AdvanceGatherProbesResult {
  if (entryUnitIds.length === 0) {
    return { probes: [], spawned: [], nextSequence: loadSequence, entryVacantTicks: {} }
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const durations = gatherPhaseDurationsMs(inputIntervalSec)
  const vacantTicksByEntry = { ...tickAllEntryVacancy(loads, entryUnitIds, entryVacantTicks) }
  const probeByKey = new Map(
    probes.map((probe) => [`${probe.entryUnitId}:${probe.probeSlot}`, { ...probe }]),
  )
  const spawned: PathSimulationLoad[] = []
  let nextSequence = loadSequence
  const stepMs = PATH_SIMULATION_STEP_MS

  for (let index = 0; index < entryUnitIds.length; index += 1) {
    const entryUnitId = entryUnitIds[index]!
    const entryUnit = unitMap.get(entryUnitId)
    // 연동 속성(OHT 등) 투입점은 외부 반송장치가 자재를 공급 — 프로브 제외 (initGatherProbes와 동일 규칙)
    if (!entryUnit || entryUnit.interfaceUnit != null) continue
    const destinationUnitId = destinationUnitIdByEntry[entryUnitId] ?? null

    for (let slot = 0; slot < CONTINUOUS_PROBE_COUNT; slot += 1) {
      const probeKey = `${entryUnitId}:${slot}`
      let probe = probeByKey.get(probeKey)
      if (!probe) {
        const unit = entryUnit
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
          destinationUnitId,
        )
        probe = stepped.probe
        loads = stepped.loads
        spawned.push(...stepped.spawned)
        nextSequence = stepped.nextSequence
        // 투입 성공 틱 — 같은 틱에 toMineral을 끝까지 진행시키면 미네랄이 CST보다 먼저 사라짐
        if (stepped.spawned.length > 0) {
          break
        }
      }

      probeByKey.set(probeKey, probe)
    }
  }

  const orderedProbes = entryUnitIds.flatMap((entryUnitId) =>
    Array.from({ length: CONTINUOUS_PROBE_COUNT }, (_, slot) =>
      probeByKey.get(`${entryUnitId}:${slot}`),
    ).filter((probe): probe is GatherProbeState => probe != null),
  )

  return {
    probes: orderedProbes,
    spawned,
    nextSequence,
    entryVacantTicks: finalizeEntryVacantTicks(loads, entryUnitIds, entryVacantTicks),
  }
}

/** 한 틱당 수집 애니메이션 진행 시간(초) */
export function gatherTickSeconds(): number {
  return PATH_SIMULATION_STEP_MS / 1000
}
