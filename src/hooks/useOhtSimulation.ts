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
    setVehicles(initOhtVehicles(line, graphRef.current))
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
      setVehicles((current) =>
        advanceOhtVehicles(current, graphRef.current, targetsRef.current),
      )
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
