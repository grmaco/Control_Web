import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConveyorLine } from '../types/conveyor'
import type { MultiPathSimulationPlan, PathSimulationLoad } from '../types/unitProperties'
import {
  DEFAULT_SIM_DISCHARGE_INTERVAL_SEC,
  DEFAULT_SIM_INPUT_INTERVAL_SEC,
  PATH_REVEAL_FINAL_HOLD_MS,
  PATH_REVEAL_STEP_MS,
  PATH_SIMULATION_END_HOLD_MS,
  PATH_SIMULATION_STEP_MS,
} from '../types/unitProperties'
import {
  activeSimulationUnitIds,
  applySimulationStep,
  areAllSimulationLoadsFinished,
  countIncompleteSimulationLoads,
  initializeParallelLoads,
  isLoadFullyDischarged,
  listSimulatableEntries,
  listSimulatableOutboundPorts,
  listTestMaterialUnits,
  lineHasEnabledStk,
  mergeMultiPathSimulationPlans,
  planMultiInboundLoadPaths,
  planMultiOutboundLoadPaths,
  planMultiTestMaterialLoadPaths,
  simulationCstUnitIds,
  simulationRevealUnitIds,
  staticTestMaterialOriginUnitIds,
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

interface UsePathSimulationOptions {
  /** 테스트 자재 출고 완료 시 testMaterial 플래그 제거 */
  onClearTestMaterial?: (unitIds: string[]) => void
}

export function usePathSimulation(
  line: ConveyorLine,
  options: UsePathSimulationOptions = {},
) {
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
  const clearedTestMaterialLoadIdsRef = useRef<Set<string>>(new Set())
  const pendingTestMaterialClearRef = useRef<Set<string>>(new Set())
  const sessionLoadIdsRef = useRef<string[]>([])
  const [inputIntervalSec, setInputIntervalSec] = useState(DEFAULT_SIM_INPUT_INTERVAL_SEC)
  const [dischargeIntervalSec, setDischargeIntervalSec] = useState(
    DEFAULT_SIM_DISCHARGE_INTERVAL_SEC,
  )

  const stepTiming = useMemo(
    () => ({ inputIntervalSec, dischargeIntervalSec }),
    [dischargeIntervalSec, inputIntervalSec],
  )

  const sourceIdsKey = useMemo(
    () => [...sourceIds].sort().join('|'),
    [sourceIds],
  )

  useEffect(() => {
    setSelectedSourceUnitIds((current) => {
      const kept = current.filter((id) => sourceIds.includes(id))
      if (kept.length > 0) return kept
      return sourceIds
    })
  }, [sourceIds, sourceIdsKey])

  useEffect(() => {
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)
    clearedTestMaterialLoadIdsRef.current = new Set()
    pendingTestMaterialClearRef.current = new Set()
    sessionLoadIdsRef.current = []
    setStatus('idle')
  }, [line.id, mode])

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

  const testMaterialUnits = useMemo(() => listTestMaterialUnits(line), [line])

  const rebuildPlan = useCallback((): MultiPathSimulationPlan | null => {
    const primary =
      selectedSourceUnitIds.length === 0
        ? { loads: [], message: '' }
        : mode === 'inbound'
          ? planMultiInboundLoadPaths(line, selectedSourceUnitIds)
          : planMultiOutboundLoadPaths(line, selectedSourceUnitIds)

    const testMaterialPlan = planMultiTestMaterialLoadPaths(line)
    const merged = mergeMultiPathSimulationPlans(primary, testMaterialPlan)

    if (merged.loads.length === 0) return null
    return merged
  }, [line, mode, selectedSourceUnitIds])

  const allLoadsComplete = useCallback((nextLoads: PathSimulationLoad[]) => {
    const sessionIds = sessionLoadIdsRef.current
    if (sessionIds.length === 0) {
      return areAllSimulationLoadsFinished(nextLoads)
    }
    return sessionIds.every((loadId) => {
      const load = nextLoads.find((item) => item.id === loadId)
      return load != null && isLoadFullyDischarged(load)
    })
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
    const initialized = initializeParallelLoads(nextPlan.loads)
    sessionLoadIdsRef.current = initialized.map((load) => load.id)
    setLoads(initialized)
    beginPathReveal(initialized)
    clearedTestMaterialLoadIdsRef.current = new Set()
    pendingTestMaterialClearRef.current = new Set()
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
    clearedTestMaterialLoadIdsRef.current = new Set()
    pendingTestMaterialClearRef.current = new Set()
    sessionLoadIdsRef.current = []
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
      const initialized = initializeParallelLoads(nextPlan.loads)
      sessionLoadIdsRef.current = initialized.map((load) => load.id)
      setLoads(initialized)
      setStatus('paused')
      return
    }

    setPlan(nextPlan)
    const base = loads.length > 0 ? loads : initializeParallelLoads(nextPlan.loads)
    const advanced = applySimulationStep(base, unitMap, stepTiming)
    setLoads(advanced)
    if (allLoadsComplete(advanced)) {
      beginEndHold()
    } else {
      setStatus('paused')
    }
  }, [allLoadsComplete, beginEndHold, clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer, loads, plan, rebuildPlan, status, stepTiming, unitMap])

  useEffect(() => {
    if (status !== 'playing' || loads.length === 0) return

    clearTimer()
    timerRef.current = window.setInterval(() => {
      setLoads((current) => {
        const advanced = applySimulationStep(current, unitMap, stepTiming)
        if (allLoadsComplete(advanced)) {
          clearTimer()
          beginEndHold()
        }
        return advanced
      })
    }, PATH_SIMULATION_STEP_MS)

    return clearTimer
  }, [allLoadsComplete, beginEndHold, clearTimer, loads.length, status, stepTiming, unitMap])

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

  useEffect(() => {
    const { onClearTestMaterial } = options
    if (!onClearTestMaterial) return

    for (const load of loads) {
      if (
        load.complete &&
        load.clearsTestMaterial &&
        !clearedTestMaterialLoadIdsRef.current.has(load.id)
      ) {
        clearedTestMaterialLoadIdsRef.current.add(load.id)
        pendingTestMaterialClearRef.current.add(load.entryUnitId)
      }
    }
  }, [loads, options])

  useEffect(() => {
    const { onClearTestMaterial } = options
    if (!onClearTestMaterial) return
    if (status !== 'complete') return

    const pending = new Set(pendingTestMaterialClearRef.current)
    for (const loadId of sessionLoadIdsRef.current) {
      const load = loads.find((item) => item.id === loadId)
      if (load?.clearsTestMaterial) {
        pending.add(load.entryUnitId)
      }
    }
    if (pending.size === 0) return

    pendingTestMaterialClearRef.current = new Set()
    onClearTestMaterial([...pending])
  }, [loads, options, status])

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
    const includeCompleted = status === 'endHold' || endHoldActive
    const fromCst = simulationCstUnitIds(loads, { includeCompleted })
    if (includeCompleted || status !== 'playing') {
      return fromCst
    }
    // 재생 중: 다른 자재 출고 완료와 무관하게 이동 중 위치는 항상 표시
    return [...new Set([...fromCst, ...activeSimulationUnitIds(loads)])]
  }, [endHoldActive, isPathRevealPhase, loads, status])
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
  const staticTestMaterialUnitIds = useMemo(
    () => staticTestMaterialOriginUnitIds(line, loads),
    [line, loads],
  )
  const canSimulate =
    (sources.length > 0 && selectedSourceUnitIds.length > 0) ||
    testMaterialUnits.length > 0
  const waitingLabels = loads.filter((load) => load.waiting).map((load) => load.label)
  const incompleteLoadCount = useMemo(
    () => countIncompleteSimulationLoads(loads),
    [loads],
  )
  const progressLabel =
    loads.length > 0
      ? `${incompleteLoadCount > 0 ? `잔여 ${incompleteLoadCount}개 · ` : ''}${loads
          .map(
            (load) =>
              `${load.label} ${load.stepIndex + 1}/${load.pathUnitIds.length}${isLoadFullyDischarged(load) ? ' ✓' : ''}`,
          )
          .join(' · ')}`
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
    staticTestMaterialUnitIds,
    waitingLabels,
    testMaterialUnits,
    canSimulate,
    progressLabel,
    start,
    pause,
    resume,
    reset,
    stepForward,
    inputIntervalSec,
    setInputIntervalSec,
    dischargeIntervalSec,
    setDischargeIntervalSec,
    incompleteLoadCount,
    entries: sources,
    selectedEntryUnitIds: selectedSourceUnitIds,
    toggleEntryUnitId: toggleSourceUnitId,
  }
}
