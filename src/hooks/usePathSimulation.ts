import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConveyorLine } from '../types/conveyor'
import type { MultiPathSimulationPlan, PathSimulationLoad } from '../types/unitProperties'
import { PATH_SIMULATION_STEP_MS } from '../types/unitProperties'
import {
  activeSimulationUnitIds,
  advanceSimulationLoads,
  listSimulatableEntries,
  listSimulatableOutboundPorts,
  lineHasEnabledStk,
  planMultiInboundLoadPaths,
  planMultiOutboundLoadPaths,
  unionSimulationPathUnitIds,
} from '../utils/pathSimulation'

export type PathSimulationStatus = 'idle' | 'playing' | 'paused' | 'complete'
export type PathSimulationMode = 'inbound' | 'outbound'

export function usePathSimulation(line: ConveyorLine) {
  const [mode, setMode] = useState<PathSimulationMode>('inbound')
  const inboundEntries = useMemo(() => listSimulatableEntries(line), [line])
  const conveyorOnlyLine = useMemo(() => !lineHasEnabledStk(line), [line])
  const outboundPorts = useMemo(
    () => (mode === 'outbound' ? listSimulatableOutboundPorts(line) : []),
    [line, mode],
  )
  const sources = mode === 'inbound' ? inboundEntries : outboundPorts
  const sourceIds = useMemo(() => sources.map((source) => source.id), [sources])
  const [selectedSourceUnitIds, setSelectedSourceUnitIds] = useState<string[]>([])
  const [plan, setPlan] = useState<MultiPathSimulationPlan | null>(null)
  const [loads, setLoads] = useState<PathSimulationLoad[]>([])
  const [status, setStatus] = useState<PathSimulationStatus>('idle')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setSelectedSourceUnitIds((current) => {
      const kept = current.filter((id) => sourceIds.includes(id))
      if (kept.length > 0) return kept
      return sourceIds
    })
    setPlan(null)
    setLoads([])
    setStatus('idle')
  }, [line.id, mode, sourceIds])

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const rebuildPlan = useCallback((): MultiPathSimulationPlan | null => {
    if (selectedSourceUnitIds.length === 0) return null
    return mode === 'inbound'
      ? planMultiInboundLoadPaths(line, selectedSourceUnitIds)
      : planMultiOutboundLoadPaths(line, selectedSourceUnitIds)
  }, [line, mode, selectedSourceUnitIds])

  const allLoadsComplete = useCallback((nextLoads: PathSimulationLoad[]) => {
    return nextLoads.length > 0 && nextLoads.every((load) => load.complete)
  }, [])

  const start = useCallback(() => {
    const nextPlan = rebuildPlan()
    if (!nextPlan || nextPlan.loads.length === 0) {
      setPlan(nextPlan)
      setLoads([])
      setStatus('idle')
      return
    }
    setPlan(nextPlan)
    setLoads(nextPlan.loads)
    setStatus('playing')
  }, [rebuildPlan])

  const pause = useCallback(() => {
    clearTimer()
    setStatus((current) => (current === 'playing' ? 'paused' : current))
  }, [clearTimer])

  const resume = useCallback(() => {
    if (loads.length === 0) return
    if (allLoadsComplete(loads)) {
      setStatus('complete')
      return
    }
    setStatus('playing')
  }, [allLoadsComplete, loads])

  const reset = useCallback(() => {
    clearTimer()
    setPlan(null)
    setLoads([])
    setStatus('idle')
  }, [clearTimer])

  const unitMap = useMemo(
    () => new Map(line.units.map((unit) => [unit.id, unit])),
    [line.units],
  )

  const stepForward = useCallback(() => {
    const nextPlan = plan ?? rebuildPlan()
    if (!nextPlan || nextPlan.loads.length === 0) {
      setPlan(nextPlan)
      setLoads([])
      return
    }

    clearTimer()

    if (loads.length === 0 && status === 'idle') {
      setPlan(nextPlan)
      setLoads(nextPlan.loads)
      setStatus('paused')
      return
    }

    setPlan(nextPlan)
    setLoads((current) => {
      const base = current.length > 0 ? current : nextPlan.loads
      const advanced = advanceSimulationLoads(base, unitMap)
      setStatus(allLoadsComplete(advanced) ? 'complete' : 'paused')
      return advanced
    })
  }, [allLoadsComplete, clearTimer, loads.length, plan, rebuildPlan, status, unitMap])

  useEffect(() => {
    if (status !== 'playing' || loads.length === 0) return

    clearTimer()
    timerRef.current = window.setInterval(() => {
      setLoads((current) => {
        const advanced = advanceSimulationLoads(current, unitMap)
        if (allLoadsComplete(advanced)) {
          clearTimer()
          setStatus('complete')
        }
        return advanced
      })
    }, PATH_SIMULATION_STEP_MS)

    return clearTimer
  }, [allLoadsComplete, clearTimer, loads.length, status, unitMap])

  const toggleSourceUnitId = useCallback((sourceUnitId: string) => {
    setSelectedSourceUnitIds((current) => {
      if (current.includes(sourceUnitId)) {
        return current.filter((id) => id !== sourceUnitId)
      }
      return [...current, sourceUnitId]
    })
    setPlan(null)
    setLoads([])
    setStatus('idle')
  }, [])

  const changeMode = useCallback((nextMode: PathSimulationMode) => {
    setMode(nextMode)
    setPlan(null)
    setLoads([])
    setStatus('idle')
  }, [])

  const activeUnitIds = useMemo(
    () => activeSimulationUnitIds(loads),
    [loads],
  )
  const pathUnitIds = useMemo(
    () => unionSimulationPathUnitIds(loads.length > 0 ? loads : (plan?.loads ?? [])),
    [loads, plan],
  )
  const canSimulate = sources.length > 0 && selectedSourceUnitIds.length > 0
  const waitingLabels = loads.filter((load) => load.waiting).map((load) => load.label)
  const progressLabel =
    loads.length > 0
      ? loads
          .map((load) => `${load.label} ${load.stepIndex + 1}/${load.pathUnitIds.length}`)
          .join(' · ')
      : null
  const activeUnitLabel =
    activeUnitIds.length > 0
      ? loads
          .filter((load) => !load.complete)
          .map((load) => load.label)
          .join(', ')
      : null

  return {
    mode,
    changeMode,
    conveyorOnlyLine,
    sources,
    selectedSourceUnitIds,
    toggleSourceUnitId,
    setSelectedSourceUnitIds,
    plan,
    loads,
    status,
    activeUnitIds,
    activeUnitLabel,
    pathUnitIds,
    waitingLabels,
    canSimulate,
    progressLabel,
    start,
    pause,
    resume,
    reset,
    stepForward,
    // 이전 API 호환
    entries: sources,
    selectedEntryUnitIds: selectedSourceUnitIds,
    toggleEntryUnitId: toggleSourceUnitId,
  }
}
