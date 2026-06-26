import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConveyorLine } from '../types/conveyor'
import type { MultiPathSimulationPlan, PathSimulationLoad } from '../types/unitProperties'
import type { LoadTackTimeSummary } from '../utils/pathSimulation'
import {
  DEFAULT_SIM_DISCHARGE_INTERVAL_SEC,
  DEFAULT_SIM_INPUT_INTERVAL_SEC,
  DEFAULT_SIM_TRANSIT_INTERVAL_SEC,
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
  buildLoadTackTimeSummaries,
  clampSimIntervalSec,
  MIN_TACK_TIME_SEC,
  roundTackTimeSec,
  simulationCstUnitIds,
  simulationRevealUnitIds,
  staticTestMaterialOriginUnitIds,
  unionSimulationPathUnitIds,
} from '../utils/pathSimulation'
import {
  advanceGatherProbes,
  CONTINUOUS_INPUT_INTERVAL_SEC,
  initGatherProbes,
  type GatherProbeState,
} from '../utils/continuousInputGather'
import {
  detectWarehouseDeposits,
  resolveInboundStorageTarget,
  WAREHOUSE_SLOT_CAPACITY,
} from '../utils/warehouseSlots'

function formatStatusTail(parts: string[], maxItems = 5): string {
  if (parts.length === 0) return ''
  if (parts.length <= maxItems) return parts.join(' · ')
  return `…${parts.length - maxItems}건 · ${parts.slice(-maxItems).join(' · ')}`
}

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
  const tackSessionStartRef = useRef<number | null>(null)
  const tackPausedTotalMsRef = useRef(0)
  const tackPausedAtRef = useRef<number | null>(null)
  const frozenLoadTackSecRef = useRef<Record<string, number>>({})
  const manualStepBonusSecRef = useRef(0)
  const [tackClockTick, setTackClockTick] = useState(0)
  const [inputIntervalSec, setInputIntervalSecState] = useState(DEFAULT_SIM_INPUT_INTERVAL_SEC)
  const [dischargeIntervalSec, setDischargeIntervalSecState] = useState(
    DEFAULT_SIM_DISCHARGE_INTERVAL_SEC,
  )
  const [transitIntervalSec, setTransitIntervalSecState] = useState(
    DEFAULT_SIM_TRANSIT_INTERVAL_SEC,
  )
  const [continuousInputActive, setContinuousInputActive] = useState(false)
  const [gatherProbes, setGatherProbes] = useState<GatherProbeState[]>([])
  const [warehouseFillCounts, setWarehouseFillCounts] = useState<Record<string, number>>({})
  const [warehouseFullNotice, setWarehouseFullNotice] = useState(false)

  const continuousInputActiveRef = useRef(continuousInputActive)
  continuousInputActiveRef.current = continuousInputActive
  const gatherProbesRef = useRef(gatherProbes)
  gatherProbesRef.current = gatherProbes
  const simTickRef = useRef(0)
  const lastInjectTickRef = useRef(0)
  const injectSeqRef = useRef(0)
  const entryVacancyRef = useRef<Record<string, number>>({})
  const depositedLoadIdsRef = useRef<Set<string>>(new Set())
  const warehouseFillCountsRef = useRef(warehouseFillCounts)
  warehouseFillCountsRef.current = warehouseFillCounts
  const selectedSourceUnitIdsRef = useRef(selectedSourceUnitIds)
  selectedSourceUnitIdsRef.current = selectedSourceUnitIds

  const setInputIntervalSec = useCallback(
    (value: number) =>
      setInputIntervalSecState((current) =>
        clampSimIntervalSec(value, current),
      ),
    [],
  )
  const setDischargeIntervalSec = useCallback(
    (value: number) =>
      setDischargeIntervalSecState((current) =>
        clampSimIntervalSec(value, current),
      ),
    [],
  )
  const setTransitIntervalSec = useCallback(
    (value: number) =>
      setTransitIntervalSecState((current) =>
        clampSimIntervalSec(value, current),
      ),
    [],
  )

  const stepTiming = useMemo(
    () => ({
      inputIntervalSec: continuousInputActive
        ? CONTINUOUS_INPUT_INTERVAL_SEC
        : inputIntervalSec,
      dischargeIntervalSec,
      transitIntervalSec,
      continuousInputActive,
    }),
    [continuousInputActive, dischargeIntervalSec, inputIntervalSec, transitIntervalSec],
  )

  const storageTargetId = useMemo(() => {
    const entryId = selectedSourceUnitIds[0]
    if (!entryId) return null
    return resolveInboundStorageTarget(line, entryId)
  }, [line, selectedSourceUnitIds])

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

  const clearTackSession = useCallback(() => {
    tackSessionStartRef.current = null
    tackPausedTotalMsRef.current = 0
    tackPausedAtRef.current = null
    frozenLoadTackSecRef.current = {}
    manualStepBonusSecRef.current = 0
  }, [])

  const beginTackSession = useCallback(() => {
    tackSessionStartRef.current = Date.now()
    tackPausedTotalMsRef.current = 0
    tackPausedAtRef.current = null
    frozenLoadTackSecRef.current = {}
    manualStepBonusSecRef.current = 0
  }, [])

  const pauseTackSession = useCallback(() => {
    if (tackSessionStartRef.current == null || tackPausedAtRef.current != null) return
    tackPausedAtRef.current = Date.now()
  }, [])

  const resumeTackSession = useCallback(() => {
    if (tackPausedAtRef.current == null) return
    tackPausedTotalMsRef.current += Date.now() - tackPausedAtRef.current
    tackPausedAtRef.current = null
  }, [])

  const getLiveTackSec = useCallback((): number => {
    const bonus = manualStepBonusSecRef.current
    if (tackSessionStartRef.current != null) {
      let pausedMs = tackPausedTotalMsRef.current
      if (tackPausedAtRef.current != null) {
        pausedMs += Date.now() - tackPausedAtRef.current
      }
      const wallSec = (Date.now() - tackSessionStartRef.current - pausedMs) / 1000
      return roundTackTimeSec(wallSec + bonus)
    }
    if (bonus > 0) {
      return roundTackTimeSec(bonus)
    }
    return MIN_TACK_TIME_SEC
  }, [])

  const isTackClockRunning =
    status === 'playing' || status === 'endHold'

  useEffect(() => {
    if (!isTackClockRunning) return
    const id = window.setInterval(() => setTackClockTick((tick) => tick + 1), 100)
    return () => window.clearInterval(id)
  }, [isTackClockRunning])

  useEffect(() => {
    if (tackSessionStartRef.current == null && manualStepBonusSecRef.current <= 0) return
    const liveSec = getLiveTackSec()
    for (const load of loads) {
      if (isLoadFullyDischarged(load) && frozenLoadTackSecRef.current[load.id] == null) {
        frozenLoadTackSecRef.current[load.id] = liveSec
      }
    }
  }, [getLiveTackSec, loads, tackClockTick, status])

  useEffect(() => {
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)
    clearedTestMaterialLoadIdsRef.current = new Set()
    pendingTestMaterialClearRef.current = new Set()
    sessionLoadIdsRef.current = []
    clearTackSession()
    setContinuousInputActive(false)
    setGatherProbes([])
    setWarehouseFillCounts({})
    setWarehouseFullNotice(false)
    simTickRef.current = 0
    lastInjectTickRef.current = 0
    injectSeqRef.current = 0
    entryVacancyRef.current = {}
    depositedLoadIdsRef.current = new Set()
    setStatus('idle')
  }, [clearTackSession, line.id, mode])

  useEffect(() => () => {
    clearTimer()
    clearRevealTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
  }, [clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer])

  const testMaterialUnits = useMemo(() => listTestMaterialUnits(line), [line])

  const previewPlan = useMemo((): MultiPathSimulationPlan | null => {
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

  const rebuildPlan = useCallback((): MultiPathSimulationPlan | null => {
    return previewPlan
  }, [previewPlan])

  const tackTimeSummaries = useMemo((): LoadTackTimeSummary[] => {
    const summaries = buildLoadTackTimeSummaries(
      line,
      (plan ?? previewPlan)?.loads ?? [],
      stepTiming,
    )
    const hasSession =
      tackSessionStartRef.current != null || manualStepBonusSecRef.current > 0
    const liveSec = getLiveTackSec()

    return summaries.map((summary) => {
      const frozen = frozenLoadTackSecRef.current[summary.loadId]
      if (frozen != null) {
        return { ...summary, tackTimeSec: frozen }
      }

      const activeLoad = loads.find((load) => load.id === summary.loadId)
      if (hasSession && activeLoad) {
        return { ...summary, tackTimeSec: liveSec }
      }

      return summary
    })
  }, [getLiveTackSec, line, loads, plan, previewPlan, stepTiming, tackClockTick, status])

  const allLoadsComplete = useCallback(
    (nextLoads: PathSimulationLoad[]) => {
      if (continuousInputActiveRef.current) return false
      const sessionIds = sessionLoadIdsRef.current
      if (sessionIds.length === 0) {
        return areAllSimulationLoadsFinished(nextLoads)
      }
      return sessionIds.every((loadId) => {
        const load = nextLoads.find((item) => item.id === loadId)
        return load != null && isLoadFullyDischarged(load)
      })
    },
    [],
  )

  const toggleContinuousInput = useCallback(() => {
    if (mode !== 'inbound') return
    setContinuousInputActive((current) => {
      const next = !current
      if (next) {
        setGatherProbes(
          initGatherProbes(line, selectedSourceUnitIds, CONTINUOUS_INPUT_INTERVAL_SEC),
        )
        entryVacancyRef.current = {}
        depositedLoadIdsRef.current = new Set()
        simTickRef.current = 0
        lastInjectTickRef.current = 0
        injectSeqRef.current = 0
        setWarehouseFullNotice(false)
      } else {
        setGatherProbes([])
      }
      return next
    })
  }, [line, mode, selectedSourceUnitIds])

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
    const planLoads = nextPlan?.loads ?? []

    if (
      continuousInputActive &&
      mode === 'inbound' &&
      selectedSourceUnitIds.length > 0
    ) {
      const testOnlyLoads = planLoads.filter((load) => load.clearsTestMaterial)
      const initialized =
        testOnlyLoads.length > 0
          ? initializeParallelLoads(testOnlyLoads, stepTiming, line)
          : []
      setEndHoldActive(false)
      setPlan(nextPlan)
      sessionLoadIdsRef.current = initialized.map((load) => load.id)
      setLoads(initialized)
      setRevealSteps({})
      setFinalHoldActive(false)
      clearedTestMaterialLoadIdsRef.current = new Set()
      pendingTestMaterialClearRef.current = new Set()
      if (initialized.length > 0) {
        beginPathReveal(initialized)
      } else {
        setStatus('playing')
      }
      return
    }

    if (!nextPlan || planLoads.length === 0) {
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
    const initialized = initializeParallelLoads(planLoads, stepTiming, line)
    sessionLoadIdsRef.current = initialized.map((load) => load.id)
    setLoads(initialized)
    beginPathReveal(initialized)
    clearedTestMaterialLoadIdsRef.current = new Set()
    pendingTestMaterialClearRef.current = new Set()
  }, [
    beginPathReveal,
    continuousInputActive,
    mode,
    rebuildPlan,
    line,
    selectedSourceUnitIds.length,
    stepTiming,
  ])

  useEffect(() => {
    if (status !== 'playing') return
    if (tackSessionStartRef.current != null) return
    beginTackSession()
  }, [beginTackSession, status])

  const pause = useCallback(() => {
    clearTimer()
    clearRevealTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
    pauseTackSession()
    setStatus((current) =>
      current === 'playing' || current === 'revealing' || current === 'endHold'
        ? 'paused'
        : current,
    )
  }, [clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer, pauseTackSession])

  const resume = useCallback(() => {
    if (loads.length === 0 && !continuousInputActive) return
    resumeTackSession()
    if (loads.length === 0 && continuousInputActive) {
      setStatus('playing')
      return
    }
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
  }, [allLoadsComplete, continuousInputActive, endHoldActive, finalHoldActive, isRevealComplete, loads, revealSteps, resumeTackSession])

  const reset = useCallback(() => {
    clearTimer()
    clearRevealTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
    clearTackSession()
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)
    clearedTestMaterialLoadIdsRef.current = new Set()
    pendingTestMaterialClearRef.current = new Set()
    sessionLoadIdsRef.current = []
    setContinuousInputActive(false)
    setGatherProbes([])
    setWarehouseFillCounts({})
    setWarehouseFullNotice(false)
    simTickRef.current = 0
    lastInjectTickRef.current = 0
    injectSeqRef.current = 0
    entryVacancyRef.current = {}
    depositedLoadIdsRef.current = new Set()
    setStatus('idle')
  }, [clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTackSession, clearTimer])

  const unitMap = useMemo(
    () => new Map(line.units.map((unit) => [unit.id, unit])),
    [line.units],
  )

  const unitMapRef = useRef(unitMap)
  unitMapRef.current = unitMap
  const stepTimingRef = useRef(stepTiming)
  stepTimingRef.current = stepTiming
  const loadsRef = useRef(loads)
  loadsRef.current = loads

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
      const initialized = initializeParallelLoads(nextPlan.loads, stepTiming, line)
      sessionLoadIdsRef.current = initialized.map((load) => load.id)
      setLoads(initialized)
      beginTackSession()
      pauseTackSession()
      setStatus('paused')
      return
    }

    setPlan(nextPlan)
    const base = loads.length > 0 ? loads : initializeParallelLoads(nextPlan.loads, stepTiming, line)
    const advanced = applySimulationStep(base, unitMap, stepTiming)
    if (status === 'paused') {
      if (tackSessionStartRef.current == null) {
        beginTackSession()
        pauseTackSession()
      }
      manualStepBonusSecRef.current = roundTackTimeSec(
        manualStepBonusSecRef.current + PATH_SIMULATION_STEP_MS / 1000,
      )
      setTackClockTick((tick) => tick + 1)
    }
    setLoads(advanced)
    if (allLoadsComplete(advanced)) {
      beginEndHold()
    } else {
      setStatus('paused')
    }
  }, [allLoadsComplete, beginEndHold, beginTackSession, clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer, loads, pauseTackSession, plan, rebuildPlan, status, stepTiming, unitMap])

  useEffect(() => {
    if (status !== 'playing') return

    clearTimer()
    timerRef.current = window.setInterval(() => {
      setLoads((current) => {
        if (current.length === 0 && !continuousInputActiveRef.current) return current

        let nextLoads = current
        const entryIds = selectedSourceUnitIdsRef.current
        const beforeStep = nextLoads

        nextLoads = applySimulationStep(
          nextLoads,
          unitMapRef.current,
          stepTimingRef.current,
        )

        if (continuousInputActiveRef.current && mode === 'inbound' && entryIds.length > 0) {
          const stkId = storageTargetId
          const totalFill = stkId ? (warehouseFillCountsRef.current[stkId] ?? 0) : 0
          if (totalFill < WAREHOUSE_SLOT_CAPACITY) {
            const gatherResult = advanceGatherProbes(
              gatherProbesRef.current,
              nextLoads,
              line,
              entryIds,
              CONTINUOUS_INPUT_INTERVAL_SEC,
              injectSeqRef.current,
              entryVacancyRef.current,
            )
            gatherProbesRef.current = gatherResult.probes
            setGatherProbes(gatherResult.probes)
            entryVacancyRef.current = gatherResult.entryVacantTicks
            injectSeqRef.current = gatherResult.nextSequence
            if (gatherResult.spawned.length > 0) {
              sessionLoadIdsRef.current = [
                ...sessionLoadIdsRef.current,
                ...gatherResult.spawned.map((load) => load.id),
              ]
              nextLoads = [...nextLoads, ...gatherResult.spawned]
            }
          }
        }

        const advanced = nextLoads

        if (
          continuousInputActiveRef.current &&
          storageTargetId &&
          beforeStep !== advanced
        ) {
          const deposited = detectWarehouseDeposits(
            beforeStep,
            advanced,
            storageTargetId,
            depositedLoadIdsRef.current,
          )
          if (deposited.length > 0) {
            for (const loadId of deposited) {
              depositedLoadIdsRef.current.add(loadId)
            }
            setWarehouseFillCounts((prev) => {
              const nextCount = (prev[storageTargetId] ?? 0) + deposited.length
              if (nextCount >= WAREHOUSE_SLOT_CAPACITY) {
                setContinuousInputActive(false)
                setGatherProbes([])
                setWarehouseFullNotice(true)
              }
              return { ...prev, [storageTargetId]: nextCount }
            })
          }
        }

        if (allLoadsComplete(advanced)) {
          clearTimer()
          beginEndHold()
        }
        return advanced
      })
    }, PATH_SIMULATION_STEP_MS)

    return clearTimer
  }, [allLoadsComplete, beginEndHold, clearTimer, line, mode, status, storageTargetId])

  useEffect(() => {
    if (status !== 'revealing' || finalHoldActive) return
    if (loadsRef.current.length === 0) return

    clearRevealTimer()
    revealTimerRef.current = window.setInterval(() => {
      setRevealSteps((current) => {
        const next = { ...current }
        for (const load of loadsRef.current) {
          const max = load.pathUnitIds.length - 1
          const step = next[load.id] ?? 0
          if (step < max) next[load.id] = step + 1
        }
        return next
      })
    }, PATH_REVEAL_STEP_MS)

    return clearRevealTimer
  }, [clearRevealTimer, finalHoldActive, status])

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
    clearTackSession()
    setContinuousInputActive(false)
    setGatherProbes([])
    setStatus('idle')
  }, [clearTackSession])

  const changeMode = useCallback((nextMode: PathSimulationMode) => {
    setMode(nextMode)
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setFinalHoldActive(false)
    setEndHoldActive(false)
    clearTackSession()
    setContinuousInputActive(false)
    setGatherProbes([])
    setStatus('idle')
  }, [clearTackSession])

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
      ? `${incompleteLoadCount > 0 ? `잔여 ${incompleteLoadCount}개 · ` : ''}${formatStatusTail(
          loads.map(
            (load) =>
              `${load.label} ${load.stepIndex + 1}/${load.pathUnitIds.length}${isLoadFullyDischarged(load) ? ' ✓' : ''}`,
          ),
        )}`
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
    transitIntervalSec,
    setTransitIntervalSec,
    incompleteLoadCount,
    tackTimeSummaries,
    continuousInputActive,
    gatherProbes,
    continuousGatherProbes: gatherProbes,
    continuousGatherAnimating: status === 'playing' && continuousInputActive,
    continuousInputIntervalSec: continuousInputActive
      ? CONTINUOUS_INPUT_INTERVAL_SEC
      : inputIntervalSec,
    toggleContinuousInput,
    warehouseFillCounts,
    warehouseFullNotice,
    dismissWarehouseFullNotice: () => setWarehouseFullNotice(false),
    storageTargetId,
    entries: sources,
    selectedEntryUnitIds: selectedSourceUnitIds,
    toggleEntryUnitId: toggleSourceUnitId,
  }
}
