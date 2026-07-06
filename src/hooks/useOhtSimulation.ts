import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConveyorLine } from '../types/conveyor'
import {
  advanceOhtVehicles,
  buildOhtRailGraph,
  initOhtVehicles,
  OHT_INTERFACE_MS,
  OHT_SIM_STEP_MS,
  resolveOhtTargets,
  type OhtRailGraph,
  type OhtTarget,
  type OhtVehicleState,
} from '../utils/ohtSimulation'
import { runPioSequence } from '../utils/pioSequence'

/**
 * OHT 인터페이스 시작 감지 → PIO 핸드셰이크 트랜잭션 발행.
 * moving→interfacing 전환 시점에 인터페이스 대기시간에 맞춘 E84 시퀀스를 기록한다.
 * carrying=false → 모듈에서 자재 픽업(UNLOAD), carrying=true → 모듈에 적재(LOAD)
 */
function emitPioForOhtTransitions(
  prev: OhtVehicleState[],
  next: OhtVehicleState[],
  line: ConveyorLine,
): void {
  const prevById = new Map(prev.map((v) => [v.id, v]))
  for (const v of next) {
    const p = prevById.get(v.id)
    if (!p || p.phase === 'interfacing' || v.phase !== 'interfacing') continue
    const targetUnit = line.units.find((u) => u.id === v.targetUnitId)
    runPioSequence({
      pairKind: 'MODULE_OHT',
      operation: p.carrying ? 'LOAD' : 'UNLOAD',
      activeName: v.name,
      passiveName: targetUnit?.name ?? v.targetUnitId ?? '모듈',
      source: 'sim-oht',
      scaleToTotalMs: OHT_INTERFACE_MS,
    })
  }
}

export type OhtSimulationStatus = 'idle' | 'playing' | 'paused'

export interface UseOhtSimulation {
  status: OhtSimulationStatus
  vehicles: OhtVehicleState[]
  graph: OhtRailGraph
  targets: OhtTarget[]
  hasRails: boolean
  hasVehicles: boolean
  hasTargets: boolean
  canSimulate: boolean
  animating: boolean
  stepMs: number
  interfaceMs: number
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
}

export function useOhtSimulation(line: ConveyorLine): UseOhtSimulation {
  const graph = useMemo(() => buildOhtRailGraph(line), [line])
  const targets = useMemo(() => resolveOhtTargets(line, graph), [line, graph])

  const [status, setStatus] = useState<OhtSimulationStatus>('idle')
  const [vehicles, setVehicles] = useState<OhtVehicleState[]>([])

  const graphRef = useRef(graph)
  graphRef.current = graph
  const targetsRef = useRef(targets)
  targetsRef.current = targets
  const timerRef = useRef<number | null>(null)
  // StrictMode에서 setState 업데이터가 이중 호출될 수 있어
  // PIO 발행은 ref 기반 diff로 인터벌 콜백에서 1회만 수행
  const vehiclesRef = useRef<OhtVehicleState[]>([])
  const lineRef = useRef(line)
  lineRef.current = line

  const hasRails = graph.nodes.size > 0
  const hasVehicles = (line.ohtUnits?.length ?? 0) > 0
  const hasTargets = targets.length > 0
  const canSimulate = hasRails && hasVehicles && hasTargets

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    clearTimer()
    setStatus('idle')
    vehiclesRef.current = []
    setVehicles([])
  }, [clearTimer])

  // 라인이 바뀌면 시뮬 초기화
  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id])

  const start = useCallback(() => {
    if (!canSimulate) return
    clearTimer()
    const initial = initOhtVehicles(line, graphRef.current)
    vehiclesRef.current = initial
    setVehicles(initial)
    setStatus('playing')
  }, [canSimulate, clearTimer, line])

  const pause = useCallback(() => {
    setStatus((s) => (s === 'playing' ? 'paused' : s))
  }, [])

  const resume = useCallback(() => {
    setStatus((s) => (s === 'paused' ? 'playing' : s))
  }, [])

  useEffect(() => {
    if (status !== 'playing') {
      clearTimer()
      return
    }
    clearTimer()
    timerRef.current = window.setInterval(() => {
      const prev = vehiclesRef.current
      const next = advanceOhtVehicles(prev, graphRef.current, targetsRef.current)
      // 인터페이스 진입 감지 → PIO 타임차트 기록 (인터벌 콜백에서 1회만 실행)
      emitPioForOhtTransitions(prev, next, lineRef.current)
      vehiclesRef.current = next
      setVehicles(next)
    }, OHT_SIM_STEP_MS)
    return clearTimer
  }, [status, clearTimer])

  return {
    status,
    vehicles,
    graph,
    targets,
    hasRails,
    hasVehicles,
    hasTargets,
    canSimulate,
    animating: status === 'playing',
    stepMs: OHT_SIM_STEP_MS,
    interfaceMs: OHT_INTERFACE_MS,
    start,
    pause,
    resume,
    reset,
  }
}
