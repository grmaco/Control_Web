import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConveyorLine } from '../types/conveyor'
import type { MultiPathSimulationPlan, PathSimulationLoad } from '../types/unitProperties'
import {
  PATH_REVEAL_FINAL_HOLD_MS,
  PATH_REVEAL_STEP_MS,
  PATH_SIMULATION_END_HOLD_MS,
  PATH_SIMULATION_STEP_MS,
} from '../types/unitProperties'
import {
  activeSimulationUnitIds,
  advanceSimulationLoads,
  listSimulatableEntries,
  listSimulatableOutboundPorts,
  lineHasEnabledStk,
  planMultiInboundLoadPaths,
  planMultiOutboundLoadPaths,
  simulationCstUnitIds,
  simulationRevealUnitIds,
  unionSimulationPathUnitIds,
} from '../utils/pathSimulation'

export type PathSimulationStatus =
  | 'idle'
  | 'revealing'
  | 'playing'
  | 'endHold'
  | 'paused'
  | 'complete'
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
  const [revealSteps, setRevealSteps] = useState<Record<string, number>>({})
  const [finalHoldActive, setFinalHoldActive] = useState(false)
  const [endHoldActive, setEndHoldActive] = useState(false)
  const timerRef = useRef<number | null>(null)
  const revealTimerRef = useRef<number | null>(null)
  const finalHoldTimerRef = useRef<number | null>(null)
  const endHoldTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setSelectedSourceUnitIds((current) => {
      const kept = current.filter((id) => sourceIds.includes(id))
      if (kept.length > 0) return kept
      return sourceIds
    })
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)
    setStatus('idle')
  }, [line.id, mode, sourceIds])

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current != null) {
      window.clearInterval(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }, [])

  const clearFinalHoldTimer = useCallback(() => {
    if (finalHoldTimerRef.current != null) {
      window.clearTimeout(finalHoldTimerRef.current)
      finalHoldTimerRef.current = null
    }
  }, [])

  const clearEndHoldTimer = useCallback(() => {
    if (endHoldTimerRef.current != null) {
      window.clearTimeout(endHoldTimerRef.current)
      endHoldTimerRef.current = null
    }
  }, [])

  useEffect(() => () => {
    clearTimer()
    clearRevealTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
  }, [clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer])

  const rebuildPlan = useCallback((): MultiPathSimulationPlan | null => {
    if (selectedSourceUnitIds.length === 0) return null
    return mode === 'inbound'
      ? planMultiInboundLoadPaths(line, selectedSourceUnitIds)
      : planMultiOutboundLoadPaths(line, selectedSourceUnitIds)
  }, [line, mode, selectedSourceUnitIds])

  const allLoadsComplete = useCallback((nextLoads: PathSimulationLoad[]) => {
    return nextLoads.length > 0 && nextLoads.every((load) => load.complete)
  }, [])

  const isRevealComplete = useCallback(
    (steps: Record<string, number>, nextLoads: PathSimulationLoad[]) => {
      return nextLoads.every((load) => {
        if (load.pathUnitIds.length === 0) return true
        const max = load.pathUnitIds.length - 1
        return (steps[load.id] ?? 0) >= max
      })
    },
    [],
  )

  const beginPathReveal = useCallback(
    (nextLoads: PathSimulationLoad[]) => {
      const initialSteps = Object.fromEntries(nextLoads.map((load) => [load.id, 0]))
      setRevealSteps(initialSteps)
      setFinalHoldActive(false)
      if (isRevealComplete(initialSteps, nextLoads)) {
        setFinalHoldActive(true)
        setStatus('revealing')
        return
      }
      setStatus('revealing')
    },
    [isRevealComplete],
  )

  const beginEndHold = useCallback(() => {
    setEndHoldActive(true)
    setStatus('endHold')
  }, [])

  const start = useCallback(() => {
    const nextPlan = rebuildPlan()
    if (!nextPlan || nextPlan.loads.length === 0) {
      setPlan(nextPlan)
      setLoads([])
      setRevealSteps({})
      setFinalHoldActive(false)
      setEndHoldActive(false)
      setStatus('idle')
      return
    }
    setEndHoldActive(false)
    setPlan(nextPlan)
    setLoads(nextPlan.loads)
    beginPathReveal(nextPlan.loads)
  }, [beginPathReveal, rebuildPlan])

  const pause = useCallback(() => {
    clearTimer()
    clearRevealTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
    setStatus((current) =>
      current === 'playing' || current === 'revealing' || current === 'endHold'
        ? 'paused'
        : current,
    )
  }, [clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer])

  const resume = useCallback(() => {
    if (loads.length === 0) return
    if (endHoldActive && allLoadsComplete(loads)) {
      setStatus('endHold')
      return
    }
    if (allLoadsComplete(loads)) {
      setStatus('complete')
      return
    }
    if (finalHoldActive || !isRevealComplete(revealSteps, loads)) {
      setStatus('revealing')
      return
    }
    setStatus('playing')
  }, [allLoadsComplete, endHoldActive, finalHoldActive, isRevealComplete, loads, revealSteps])

  const reset = useCallback(() => {
    clearTimer()
    clearRevealTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)
    setStatus('idle')
  }, [clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer])

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
    clearRevealTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)

    if (loads.length === 0 && status === 'idle') {
      setPlan(nextPlan)
      setLoads(nextPlan.loads)
      setStatus('paused')
      return
    }

    setPlan(nextPlan)
    const base = loads.length > 0 ? loads : nextPlan.loads
    const advanced = advanceSimulationLoads(base, unitMap)
    setLoads(advanced)
    if (allLoadsComplete(advanced)) {
      beginEndHold()
    } else {
      setStatus('paused')
    }
  }, [allLoadsComplete, beginEndHold, clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer, loads, plan, rebuildPlan, status, unitMap])

  useEffect(() => {
    if (status !== 'playing' || loads.length === 0) return

    clearTimer()
    timerRef.current = window.setInterval(() => {
      setLoads((current) => {
        const advanced = advanceSimulationLoads(current, unitMap)
        if (allLoadsComplete(advanced)) {
          clearTimer()
          beginEndHold()
        }
        return advanced
      })
    }, PATH_SIMULATION_STEP_MS)

    return clearTimer
  }, [allLoadsComplete, beginEndHold, clearTimer, loads.length, status, unitMap])

  useEffect(() => {
    if (status !== 'revealing' || finalHoldActive || loads.length === 0) return

    clearRevealTimer()
    revealTimerRef.current = window.setInterval(() => {
      setRevealSteps((current) => {
        const next = { ...current }
        for (const load of loads) {
          const max = load.pathUnitIds.length - 1
          const step = next[load.id] ?? 0
          if (step < max) next[load.id] = step + 1
        }
        return next
      })
    }, PATH_REVEAL_STEP_MS)

    return clearRevealTimer
  }, [clearRevealTimer, finalHoldActive, loads, status])

  useEffect(() => {
    if (status !== 'revealing' || finalHoldActive || loads.length === 0) return
    if (!isRevealComplete(revealSteps, loads)) return

    clearRevealTimer()
    setFinalHoldActive(true)
  }, [clearRevealTimer, finalHoldActive, isRevealComplete, loads, revealSteps, status])

  useEffect(() => {
    if (!finalHoldActive || status !== 'revealing' || loads.length === 0) return

    clearFinalHoldTimer()
    finalHoldTimerRef.current = window.setTimeout(() => {
      setFinalHoldActive(false)
      setRevealSteps({})
      setStatus('playing')
    }, PATH_REVEAL_FINAL_HOLD_MS)

    return clearFinalHoldTimer
  }, [clearFinalHoldTimer, finalHoldActive, loads.length, status])

  useEffect(() => {
    if (status !== 'endHold' || !endHoldActive || loads.length === 0) return

    clearEndHoldTimer()
    endHoldTimerRef.current = window.setTimeout(() => {
      setEndHoldActive(false)
      setStatus('complete')
    }, PATH_SIMULATION_END_HOLD_MS)

    return clearEndHoldTimer
  }, [clearEndHoldTimer, endHoldActive, loads.length, status])

  const toggleSourceUnitId = useCallback((sourceUnitId: string) => {
    setSelectedSourceUnitIds((current) => {
      if (current.includes(sourceUnitId)) {
        return current.filter((id) => id !== sourceUnitId)
      }
      return [...current, sourceUnitId]
    })
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)
    setStatus('idle')
  }, [])

  const changeMode = useCallback((nextMode: PathSimulationMode) => {
    setMode(nextMode)
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)
    setStatus('idle')
  }, [])

  const isPathRevealPhase = useMemo(() => {
    if (status === 'revealing') return true
    if (status !== 'paused' || endHoldActive) return false
    if (finalHoldActive) return true
    return !isRevealComplete(revealSteps, loads)
  }, [endHoldActive, finalHoldActive, isRevealComplete, loads, revealSteps, status])

  const activeUnitIds = useMemo(
    () => activeSimulationUnitIds(loads),
    [loads],
  )
  const cstUnitIds = useMemo(() => {
    if (status === 'complete') return []
    if (isPathRevealPhase) return []
    return simulationCstUnitIds(loads)
  }, [isPathRevealPhase, loads, status])
  const neonUnitIds = useMemo(() => {
    if (finalHoldActive || status === 'revealing') {
      return simulationRevealUnitIds(loads, revealSteps)
    }
    if (status === 'paused' && !isRevealComplete(revealSteps, loads)) {
      return simulationRevealUnitIds(loads, revealSteps)
    }
    if (status === 'paused' && finalHoldActive) {
      return simulationRevealUnitIds(loads, revealSteps)
    }
    if (status === 'endHold' || (status === 'paused' && endHoldActive)) {
      return cstUnitIds
    }
    return cstUnitIds
  }, [cstUnitIds, endHoldActive, finalHoldActive, isRevealComplete, loads, revealSteps, status])
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
    cstUnitIds.length > 0
      ? loads
          .filter((load) => load.pathUnitIds.length > 0)
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
    cstUnitIds,
    neonUnitIds,
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
    entries: sources,
    selectedEntryUnitIds: selectedSourceUnitIds,
    toggleEntryUnitId: toggleSourceUnitId,
  }
}
