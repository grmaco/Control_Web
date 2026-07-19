import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type {
  MultiPathSimulationPlan,
  PathSimulationLoad,
} from '../types/unitProperties'
import type { LoadTackTimeSummary } from '../utils/pathSimulation'
import {
  DEFAULT_SIM_DISCHARGE_INTERVAL_SEC,
  DEFAULT_SIM_INPUT_INTERVAL_SEC,
  DEFAULT_SIM_TRANSIT_INTERVAL_SEC,
  PATH_REVEAL_FINAL_HOLD_MS,
  PATH_REVEAL_GAP_MS,
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
  isCompletedLoadAwaitingPickup,
  isLoadFullyDischarged,
  isLoadAtBlockedPortDestination,
  listSimulatableEntries,
  listSimulatableOutboundPorts,
  listTestMaterialUnits,
  lineHasEnabledStk,
  mergeMultiPathSimulationPlans,
  lineWithAllSimulationUnitsRunning,
  planMultiInboundLoadPaths,
  planMultiOutboundLoadPaths,
  planMultiTestMaterialLoadPaths,
  buildInboundSimDestinationByUnitId,
  buildLoadTackTimeSummaries,
  buildSequentialRevealLoadOrder,
  clampSimIntervalSec,
  initializeLoadsForSequentialReveal,
  releaseAllSimulationLoads,
  revealPathUnitIdsForLoad,
  simulationSequentialRevealUnitIds,
  MIN_TACK_TIME_SEC,
  roundTackTimeSec,
  simulationCstUnitIds,
  simulationRevealUnitIds,
  spawnContinuousInjectLoad,
  spawnOutboundDischargeLoad,
  staticTestMaterialOriginUnitIds,
  unionSimulationConveyorPathUnitIds,
  type SimulationStepResult,
} from '../utils/pathSimulation'
import { SIM_STK_IO_ENABLED } from '../constants/simStkIo'
import {
  advanceGatherProbes,
  CONTINUOUS_INPUT_INTERVAL_SEC,
  initGatherProbes,
  type GatherProbeState,
} from '../utils/continuousInputGather'
import { computeMinimapFlowMap } from '../utils/flowDirection'
import { listReachableInboundDestinations } from '../utils/simulationDestination'
import {
  anyInboundStkHasCapacity,
  isInboundConveyorLineFull,
  detectWarehouseDeposits,
  resolveInboundStorageTarget,
} from '../utils/warehouseSlots'

function formatStatusTail(parts: string[], maxItems = 5): string {
  if (parts.length === 0) return ''
  if (parts.length <= maxItems) return parts.join(' · ')
  return `…${parts.length - maxItems}건 · ${parts.slice(-maxItems).join(' · ')}`
}

function formatLoadProgressLine(load: PathSimulationLoad): string {
  if (load.pathUnitIds.length === 0) return load.label
  const suffix = isLoadFullyDischarged(load) ? ' ✓' : load.waiting ? ' ⏸' : ''
  return `${load.label} ${load.stepIndex + 1}/${load.pathUnitIds.length}${suffix}`
}

/** 진행 푸터 — headline 짧게, detail은 hover용 전체 목록 */
function buildSimulationProgressSummary(
  loads: PathSimulationLoad[],
  incompleteLoadCount: number,
): { headline: string | null; detail: string | null } {
  if (loads.length === 0) return { headline: null, detail: null }

  const detailLines = loads.map(formatLoadProgressLine)
  const detail = detailLines.length > 1 ? detailLines.join(' · ') : null

  if (loads.length <= 3) {
    return {
      headline: formatStatusTail(detailLines, 3),
      detail,
    }
  }

  const waitingCount = loads.filter((load) => load.waiting && !load.complete).length
  const completedCount = loads.filter((load) => isLoadFullyDischarged(load)).length
  const parts = [`${loads.length}건`]
  if (completedCount > 0) parts.push(`완료 ${completedCount}`)
  if (incompleteLoadCount > 0) parts.push(`잔여 ${incompleteLoadCount}`)
  if (waitingCount > 0) parts.push(`대기 ${waitingCount}`)

  const highlightLoads = loads
    .filter((load) => load.pathUnitIds.length > 0 && !isLoadFullyDischarged(load))
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.stepIndex - a.stepIndex)
    .slice(0, 2)

  if (highlightLoads.length > 0) {
    parts.push(highlightLoads.map(formatLoadProgressLine).join(' · '))
  }

  return { headline: parts.join(' · '), detail }
}

export type PathSimulationStatus =
  | 'idle'
  | 'revealing'
  | 'playing'
  | 'endHold'
  | 'paused'
  | 'complete'
export type PathSimulationMode = 'inbound' | 'outbound'

/** 시뮬 시작 옵션 — preserveUnitStatus: 실제 CV·포트 상태 유지(오류 우회 관찰) */
export type PathSimulationStartOptions = {
  preserveUnitStatus?: boolean
}

function buildMultiPathPlan(
  activeLine: ConveyorLine,
  mode: PathSimulationMode,
  selectedSourceUnitIds: string[],
  inboundDestinationByEntryId: Record<string, string> = {},
): MultiPathSimulationPlan | null {
  if (mode === 'inbound') {
    if (selectedSourceUnitIds.length === 0) return null
    const primary = planMultiInboundLoadPaths(
      activeLine,
      selectedSourceUnitIds,
      { destinationUnitIdByEntry: inboundDestinationByEntryId },
    )
    // 유닛에 올려둔 테스트 자재도 함께 출발 — 위치→종료점 경로 병합
    const testMaterials = planMultiTestMaterialLoadPaths(activeLine)
    const merged =
      testMaterials.loads.length > 0
        ? mergeMultiPathSimulationPlans(primary, testMaterials)
        : primary
    if (merged.loads.length === 0) return null
    return merged
  }

  if (selectedSourceUnitIds.length === 0) return null
  const outbound = planMultiOutboundLoadPaths(activeLine, selectedSourceUnitIds)
  if (outbound.loads.length === 0) return null
  return outbound
}

interface UsePathSimulationOptions {
  /** 테스트 자재 출고 완료 시 testMaterial 플래그 제거 */
  onClearTestMaterial?: (unitIds: string[]) => void
}

export function usePathSimulation(
  line: ConveyorLine,
  options: UsePathSimulationOptions = {},
) {
  const [mode, setMode] = useState<PathSimulationMode>('inbound')
  const [preserveUnitStatus, setPreserveUnitStatus] = useState(false)
  const simulationLine = useMemo(
    () =>
      preserveUnitStatus ? line : lineWithAllSimulationUnitsRunning(line),
    [line, preserveUnitStatus],
  )
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
  const [revealOrder, setRevealOrder] = useState<string[]>([])
  const [activeRevealIndex, setActiveRevealIndex] = useState(0)
  const [sequentialRevealActive, setSequentialRevealActive] = useState(false)
  const [revealGapActive, setRevealGapActive] = useState(false)
  const [finalHoldActive, setFinalHoldActive] = useState(false)
  const [endHoldActive, setEndHoldActive] = useState(false)
  const timerRef = useRef<number | null>(null)
  const revealTimerRef = useRef<number | null>(null)
  const revealGapTimerRef = useRef<number | null>(null)
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
  const [turn90Sec, setTurn90SecState] = useState(1.0)
  const [turn180Sec, setTurn180SecState] = useState(1.6)
  const [turn270Sec, setTurn270SecState] = useState(2.2)
  const [continuousInputActive, setContinuousInputActive] = useState(false)
  const [gatherProbes, setGatherProbes] = useState<GatherProbeState[]>([])
  const [warehouseFillCounts, setWarehouseFillCounts] = useState<Record<string, number>>({})
  const [warehouseFullNotice, setWarehouseFullNotice] = useState(false)
  const [inboundLineFullBlocked, setInboundLineFullBlocked] = useState(false)
  const [inboundLineFullNotice, setInboundLineFullNotice] = useState(false)
  const [inboundDestinationByEntryId, setInboundDestinationByEntryId] = useState<
    Record<string, string>
  >({})

  const continuousInputActiveRef = useRef(continuousInputActive)
  continuousInputActiveRef.current = continuousInputActive
  const gatherProbesRef = useRef(gatherProbes)
  gatherProbesRef.current = gatherProbes
  const simTickRef = useRef(0)
  const lastInjectTickRef = useRef(0)
  const injectSeqRef = useRef(0)
  const entryVacancyRef = useRef<Record<string, number>>({})
  const inboundLineFullConsecutiveRef = useRef(0)
  const turnReturnDwellsRef = useRef<Record<string, number>>({})
  const depositedLoadIdsRef = useRef<Set<string>>(new Set())
  const warehouseFillCountsRef = useRef(warehouseFillCounts)
  warehouseFillCountsRef.current = warehouseFillCounts
  const selectedSourceUnitIdsRef = useRef(selectedSourceUnitIds)
  selectedSourceUnitIdsRef.current = selectedSourceUnitIds
  const inboundDestinationByEntryIdRef = useRef(inboundDestinationByEntryId)
  inboundDestinationByEntryIdRef.current = inboundDestinationByEntryId
  const onClearTestMaterialRef = useRef(options.onClearTestMaterial)
  onClearTestMaterialRef.current = options.onClearTestMaterial
  const revealOrderRef = useRef(revealOrder)
  revealOrderRef.current = revealOrder
  const activeRevealIndexRef = useRef(activeRevealIndex)
  activeRevealIndexRef.current = activeRevealIndex
  const sequentialRevealActiveRef = useRef(sequentialRevealActive)
  sequentialRevealActiveRef.current = sequentialRevealActive

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

  const setInboundDestinationForEntry = useCallback(
    (entryUnitId: string, destinationUnitId: string) => {
      setInboundDestinationByEntryId((prev) => ({
        ...prev,
        [entryUnitId]: destinationUnitId,
      }))
    },
    [],
  )

  const inboundDestinationsByEntryId = useMemo((): Record<string, ConveyorUnit[]> => {
    if (mode !== 'inbound') return {}
    const map: Record<string, ConveyorUnit[]> = {}
    for (const entryId of selectedSourceUnitIds) {
      map[entryId] = listReachableInboundDestinations(line, entryId)
    }
    return map
  }, [line, mode, selectedSourceUnitIds])

  useEffect(() => {
    if (mode !== 'inbound') return
    let savedPrefs: Record<string, string> = {}
    try {
      const raw = sessionStorage.getItem(`sim-dest-${line.id}`)
      if (raw) savedPrefs = JSON.parse(raw) as Record<string, string>
    } catch {
      // ignore
    }
    setInboundDestinationByEntryId((prev) => {
      const next = { ...prev }
      let changed = false
      for (const entryId of selectedSourceUnitIds) {
        const destinations = listReachableInboundDestinations(line, entryId)
        const current = next[entryId]
        if (!current || !destinations.some((dest) => dest.id === current)) {
          const savedId = savedPrefs[entryId]
          const savedValid = savedId != null && destinations.some((dest) => dest.id === savedId)
          const farthest = destinations[destinations.length - 1]
          const target = savedValid ? savedId : farthest?.id
          if (target) {
            next[entryId] = target
            changed = true
          }
        }
      }
      for (const key of Object.keys(next)) {
        if (!selectedSourceUnitIds.includes(key)) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [line, mode, selectedSourceUnitIds])

  useEffect(() => {
    if (Object.keys(inboundDestinationByEntryId).length === 0) return
    try {
      const key = `sim-dest-${line.id}`
      const raw = sessionStorage.getItem(key)
      const existing: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {}
      sessionStorage.setItem(key, JSON.stringify({ ...existing, ...inboundDestinationByEntryId }))
    } catch {
      // ignore
    }
  }, [line.id, inboundDestinationByEntryId])

  const setTurn90Sec = useCallback((v: number) => setTurn90SecState(clampSimIntervalSec(v, 1.0)), [])
  const setTurn180Sec = useCallback((v: number) => setTurn180SecState(clampSimIntervalSec(v, 1.6)), [])
  const setTurn270Sec = useCallback((v: number) => setTurn270SecState(clampSimIntervalSec(v, 2.2)), [])

  const stepTiming = useMemo(
    () => ({
      inputIntervalSec: continuousInputActive
        ? CONTINUOUS_INPUT_INTERVAL_SEC
        : inputIntervalSec,
      dischargeIntervalSec,
      transitIntervalSec,
      continuousInputActive,
      turnTransitSec: { 90: turn90Sec, 180: turn180Sec, 270: turn270Sec },
    }),
    [continuousInputActive, dischargeIntervalSec, inputIntervalSec, transitIntervalSec, turn90Sec, turn180Sec, turn270Sec],
  )

  const storageTargetId = useMemo(() => {
    const entryId = selectedSourceUnitIds[0]
    if (!entryId) return null
    return resolveInboundStorageTarget(simulationLine, entryId)
  }, [selectedSourceUnitIds, simulationLine])

  const sourceIdsKey = useMemo(
    () => [...sourceIds].sort().join('|'),
    [sourceIds],
  )

  useEffect(() => {
    setSelectedSourceUnitIds((current) => {
      const filtered = current.filter((id) => sourceIds.includes(id))
      if (filtered.length === 0 && sourceIds.length > 0) return [...sourceIds]
      return filtered.length !== current.length ? filtered : current
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

  const clearRevealGapTimer = useCallback(() => {
    if (revealGapTimerRef.current != null) {
      window.clearTimeout(revealGapTimerRef.current)
      revealGapTimerRef.current = null
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
      if (frozenLoadTackSecRef.current[load.id] != null) continue
      if (
        isLoadFullyDischarged(load, unitMapRef.current) ||
        // 목적지 도착 후 회수 대기(포트 STK·OHT 픽업) 중인 자재 — 반송은 끝났으므로
        // 대기 시간이 Tack Time에 계속 누적되지 않도록 도착 시점에 동결
        isCompletedLoadAwaitingPickup(load, unitMapRef.current) ||
        isLoadAtBlockedPortDestination(load, unitMapRef.current)
      ) {
        frozenLoadTackSecRef.current[load.id] = liveSec
      }
    }
  }, [getLiveTackSec, loads, tackClockTick, status])

  useEffect(() => {
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setRevealOrder([])
    setActiveRevealIndex(0)
    setSequentialRevealActive(false)
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
    clearRevealGapTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
  }, [clearEndHoldTimer, clearFinalHoldTimer, clearRevealGapTimer, clearRevealTimer, clearTimer])

  const testMaterialUnits = useMemo(() => listTestMaterialUnits(line), [line])

  const previewPlan = useMemo(
    (): MultiPathSimulationPlan | null =>
      buildMultiPathPlan(
        line,
        mode,
        selectedSourceUnitIds,
        inboundDestinationByEntryId,
      ),
    [inboundDestinationByEntryId, line, mode, selectedSourceUnitIds],
  )

  const rebuildPlan = useCallback((): MultiPathSimulationPlan | null => {
    return previewPlan
  }, [previewPlan])

  const tackTimeSummaries = useMemo((): LoadTackTimeSummary[] => {
    const summaries = buildLoadTackTimeSummaries(
      simulationLine,
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
  }, [getLiveTackSec, loads, plan, previewPlan, simulationLine, stepTiming, tackClockTick, status])

  const allLoadsComplete = useCallback(
    (nextLoads: PathSimulationLoad[]) => {
      if (continuousInputActiveRef.current) return false
      const sessionIds = sessionLoadIdsRef.current
      if (sessionIds.length === 0) {
        return areAllSimulationLoadsFinished(nextLoads, unitMapRef.current)
      }
      return sessionIds.every((loadId) => {
        const load = nextLoads.find((item) => item.id === loadId)
        return load != null && isLoadFullyDischarged(load, unitMapRef.current)
      })
    },
    [],
  )

  const beginContinuousInputSession = useCallback(
    (activeLine: ConveyorLine = simulationLine) => {
      continuousInputActiveRef.current = true
      setContinuousInputActive(true)
      setGatherProbes(
        initGatherProbes(
          activeLine,
          selectedSourceUnitIds,
          CONTINUOUS_INPUT_INTERVAL_SEC,
        ),
      )
      entryVacancyRef.current = {}
      inboundLineFullConsecutiveRef.current = 0
      simTickRef.current = 0
      lastInjectTickRef.current = 0
      injectSeqRef.current = 0
      setWarehouseFullNotice(false)
      setInboundLineFullBlocked(false)
      setInboundLineFullNotice(false)
    },
    [selectedSourceUnitIds, simulationLine],
  )

  const clearContinuousInputSession = useCallback(() => {
    continuousInputActiveRef.current = false
    setContinuousInputActive(false)
    setGatherProbes([])
    setInboundLineFullBlocked(false)
    setInboundLineFullNotice(false)
  }, [])

  const isRevealComplete = useCallback(
    (steps: Record<string, number>, nextLoads: PathSimulationLoad[]) => {
      if (
        nextLoads.length > 0 &&
        nextLoads.every((load) => load.released)
      ) {
        return true
      }
      return nextLoads.every((load) => {
        const revealPath = revealPathUnitIdsForLoad(load)
        if (revealPath.length === 0) return true
        const max = revealPath.length - 1
        return (steps[load.id] ?? 0) >= max
      })
    },
    [],
  )

  const beginPathReveal = useCallback(
    (
      nextLoads: PathSimulationLoad[],
      options?: { sequential?: boolean },
    ) => {
      setRevealGapActive(false)
      clearRevealGapTimer()
      setFinalHoldActive(false)
      if (options?.sequential) {
        const orderIds = buildSequentialRevealLoadOrder(simulationLine, nextLoads).map(
          (load) => load.id,
        )
        setRevealOrder(orderIds)
        setActiveRevealIndex(0)
        setSequentialRevealActive(true)
        setRevealSteps(Object.fromEntries(orderIds.map((loadId) => [loadId, 0])))
        setStatus('revealing')
        return
      }

      setRevealOrder([])
      setActiveRevealIndex(0)
      setSequentialRevealActive(false)
      const initialSteps = Object.fromEntries(nextLoads.map((load) => [load.id, 0]))
      setRevealSteps(initialSteps)
      if (isRevealComplete(initialSteps, nextLoads)) {
        setFinalHoldActive(true)
      }
      setStatus('revealing')
    },
    [clearRevealGapTimer, isRevealComplete, simulationLine],
  )

  const beginEndHold = useCallback(() => {
    setEndHoldActive(true)
    setStatus('endHold')
  }, [])

  const startWithMode = useCallback(
    (
      startMode: 'normal' | 'continuous',
      options?: PathSimulationStartOptions,
    ) => {
      const useLiveStatus = options?.preserveUnitStatus === true
      setPreserveUnitStatus(useLiveStatus)
      const activeLine = useLiveStatus
        ? line
        : lineWithAllSimulationUnitsRunning(line)

      depositedLoadIdsRef.current = new Set()
      setWarehouseFillCounts({})
      setWarehouseFullNotice(false)
      setInboundLineFullBlocked(false)
      setInboundLineFullNotice(false)

      const nextPlan = buildMultiPathPlan(
        activeLine,
        mode,
        selectedSourceUnitIds,
        inboundDestinationByEntryId,
      )
      const planLoads = nextPlan?.loads ?? []

      if (
        startMode === 'continuous' &&
        mode === 'inbound' &&
        selectedSourceUnitIds.length > 0
      ) {
        beginContinuousInputSession(activeLine)
        const testOnlyLoads = planLoads.filter((load) => load.clearsTestMaterial)
        const initialized =
          testOnlyLoads.length > 0
            ? initializeParallelLoads(testOnlyLoads, stepTiming, activeLine)
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

      clearContinuousInputSession()

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
      const initialized = initializeLoadsForSequentialReveal(planLoads)
      sessionLoadIdsRef.current = initialized.map((load) => load.id)
      setLoads(initialized)
      beginPathReveal(initialized, { sequential: planLoads.length > 1 })
      clearedTestMaterialLoadIdsRef.current = new Set()
      pendingTestMaterialClearRef.current = new Set()
    },
    [
      beginContinuousInputSession,
      beginPathReveal,
      clearContinuousInputSession,
      inboundDestinationByEntryId,
      line,
      mode,
      selectedSourceUnitIds,
      stepTiming,
    ],
  )

  const start = useCallback(
    (options?: PathSimulationStartOptions) => startWithMode('normal', options),
    [startWithMode],
  )

  const startContinuous = useCallback(
    (options?: PathSimulationStartOptions) => {
      if (mode !== 'inbound') return
      if (selectedSourceUnitIds.length === 0) return
      startWithMode('continuous', options)
    },
    [mode, selectedSourceUnitIds.length, startWithMode],
  )

  useEffect(() => {
    if (status !== 'playing') return
    if (tackSessionStartRef.current != null) return
    beginTackSession()
  }, [beginTackSession, status])

  const pause = useCallback(() => {
    clearTimer()
    clearRevealTimer()
    clearRevealGapTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
    pauseTackSession()
    setStatus((current) =>
      current === 'playing' || current === 'revealing' || current === 'endHold'
        ? 'paused'
        : current,
    )
  }, [
    clearEndHoldTimer,
    clearFinalHoldTimer,
    clearRevealGapTimer,
    clearRevealTimer,
    clearTimer,
    pauseTackSession,
  ])

  const isSequentialRevealDone = useCallback(() => {
    if (!sequentialRevealActive || revealOrder.length === 0) return true
    const lastId = revealOrder[revealOrder.length - 1]!
    const load = loads.find((item) => item.id === lastId)
    const revealPath = load ? revealPathUnitIdsForLoad(load) : []
    if (!load || revealPath.length === 0) return true
    const max = revealPath.length - 1
    return (
      activeRevealIndex >= revealOrder.length - 1 &&
      (revealSteps[lastId] ?? 0) >= max
    )
  }, [activeRevealIndex, loads, revealOrder, revealSteps, sequentialRevealActive])

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
    const revealIncomplete = sequentialRevealActive
      ? !isSequentialRevealDone()
      : !isRevealComplete(revealSteps, loads)
    if (finalHoldActive || revealIncomplete) {
      setStatus('revealing')
      return
    }
    setStatus('playing')
  }, [
    allLoadsComplete,
    continuousInputActive,
    endHoldActive,
    finalHoldActive,
    isRevealComplete,
    isSequentialRevealDone,
    loads,
    revealSteps,
    resumeTackSession,
    sequentialRevealActive,
  ])

  const reset = useCallback(() => {
    clearTimer()
    clearRevealTimer()
    clearRevealGapTimer()
    clearFinalHoldTimer()
    clearEndHoldTimer()
    clearTackSession()
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setRevealOrder([])
    setActiveRevealIndex(0)
    setSequentialRevealActive(false)
    setRevealGapActive(false)
    setFinalHoldActive(false)
    setEndHoldActive(false)
    clearedTestMaterialLoadIdsRef.current = new Set()
    pendingTestMaterialClearRef.current = new Set()
    sessionLoadIdsRef.current = []
    setContinuousInputActive(false)
    setGatherProbes([])
    setWarehouseFillCounts({})
    setWarehouseFullNotice(false)
    setInboundLineFullBlocked(false)
    setInboundLineFullNotice(false)
    setPreserveUnitStatus(false)
    simTickRef.current = 0
    lastInjectTickRef.current = 0
    injectSeqRef.current = 0
    entryVacancyRef.current = {}
    turnReturnDwellsRef.current = {}
    depositedLoadIdsRef.current = new Set()
    setStatus('idle')
  }, [
    clearEndHoldTimer,
    clearFinalHoldTimer,
    clearRevealGapTimer,
    clearRevealTimer,
    clearTackSession,
    clearTimer,
  ])

  const unitMap = useMemo(
    () => new Map(simulationLine.units.map((unit) => [unit.id, unit])),
    [simulationLine.units],
  )

  const flowMap = useMemo(() => computeMinimapFlowMap(simulationLine), [simulationLine])

  const unitMapRef = useRef(unitMap)
  unitMapRef.current = unitMap
  const flowMapRef = useRef(flowMap)
  flowMapRef.current = flowMap
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
      const initialized = initializeParallelLoads(nextPlan.loads, stepTiming, simulationLine)
      sessionLoadIdsRef.current = initialized.map((load) => load.id)
      setLoads(initialized)
      beginTackSession()
      pauseTackSession()
      setStatus('paused')
      return
    }

    setPlan(nextPlan)
    const base = loads.length > 0 ? loads : initializeParallelLoads(nextPlan.loads, stepTiming, simulationLine)
    const stepResult: SimulationStepResult = applySimulationStep(
      base,
      unitMap,
      {
        ...stepTiming,
        warehouseFillCounts: warehouseFillCountsRef.current,
        turnReturnDwells: turnReturnDwellsRef.current,
      },
      flowMap,
      simulationLine,
    )
    // 복귀 대기 틱 갱신: 기존 감소 + 신규 추가
    const nextManualDwells: Record<string, number> = {}
    for (const [uid, ticks] of Object.entries(turnReturnDwellsRef.current)) {
      const rem = ticks - 1
      if (rem > 0) nextManualDwells[uid] = rem
    }
    for (const [uid, ticks] of Object.entries(stepResult.newTurnReturnDwells)) {
      nextManualDwells[uid] = ticks
    }
    turnReturnDwellsRef.current = nextManualDwells
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
    setLoads(stepResult.loads)
    if (allLoadsComplete(stepResult.loads)) {
      beginEndHold()
    } else {
      setStatus('paused')
    }
  }, [allLoadsComplete, beginEndHold, beginTackSession, clearEndHoldTimer, clearFinalHoldTimer, clearRevealTimer, clearTimer, flowMap, loads, pauseTackSession, plan, rebuildPlan, simulationLine, status, stepTiming, unitMap])

  useEffect(() => {
    if (status !== 'playing') return

    clearTimer()
    timerRef.current = window.setInterval(() => {
      setLoads((current) => {
        if (current.length === 0 && !continuousInputActiveRef.current) return current

        let nextLoads = current
        const entryIds = selectedSourceUnitIdsRef.current
        const beforeStep = nextLoads

        const fillCounts = warehouseFillCountsRef.current
        const tickStepResult: SimulationStepResult = applySimulationStep(
          nextLoads,
          unitMapRef.current,
          {
            ...stepTimingRef.current,
            warehouseFillCounts: fillCounts,
            turnReturnDwells: turnReturnDwellsRef.current,
          },
          flowMapRef.current,
          simulationLine,
        )
        // 복귀 대기 틱 갱신: 기존 감소 + 신규 추가
        const nextDwells: Record<string, number> = {}
        for (const [uid, ticks] of Object.entries(turnReturnDwellsRef.current)) {
          const rem = ticks - 1
          if (rem > 0) nextDwells[uid] = rem
        }
        for (const [uid, ticks] of Object.entries(tickStepResult.newTurnReturnDwells)) {
          nextDwells[uid] = ticks
        }
        turnReturnDwellsRef.current = nextDwells
        nextLoads = tickStepResult.loads

        if (continuousInputActiveRef.current && mode === 'inbound' && entryIds.length > 0) {
          const lineFull = isInboundConveyorLineFull(
            simulationLine,
            nextLoads,
            entryIds,
            fillCounts,
          )
          if (!lineFull) {
            const gatherResult = advanceGatherProbes(
              gatherProbesRef.current,
              nextLoads,
              simulationLine,
              entryIds,
              CONTINUOUS_INPUT_INTERVAL_SEC,
              injectSeqRef.current,
              entryVacancyRef.current,
              inboundDestinationByEntryIdRef.current,
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
              const testMaterialEntryIds = [
                ...new Set(
                  gatherResult.spawned
                    .filter((load) => load.clearsTestMaterial)
                    .map((load) => load.entryUnitId),
                ),
              ]
              if (testMaterialEntryIds.length > 0) {
                onClearTestMaterialRef.current?.(testMaterialEntryIds)
              }
            }
          }
        }

        const advanced = nextLoads

        if (continuousInputActiveRef.current && mode === 'inbound' && entryIds.length > 0) {
          const postAdvanceFull = isInboundConveyorLineFull(simulationLine, advanced, entryIds, fillCounts)
          if (postAdvanceFull) {
            inboundLineFullConsecutiveRef.current += 1
            // 1틱 디바운스: 같은 틱에 spawn된 자재가 애니메이션상 투입구에 도달하기 전에
            // 팝업이 뜨는 현상을 방지하기 위해 2틱 연속 만재 확인 후 팝업 표시
            if (inboundLineFullConsecutiveRef.current >= 2) {
              continuousInputActiveRef.current = false
              setContinuousInputActive(false)
              setInboundLineFullBlocked(true)
              setInboundLineFullNotice(true)
            }
          } else {
            inboundLineFullConsecutiveRef.current = 0
          }
        }

        if (beforeStep !== advanced) {
          const deposited = detectWarehouseDeposits(
            beforeStep,
            advanced,
            depositedLoadIdsRef.current,
            warehouseFillCountsRef.current,
          )
          if (deposited.length > 0) {
            for (const { loadId } of deposited) {
              depositedLoadIdsRef.current.add(loadId)
            }
            setWarehouseFillCounts((prev) => {
              const next = { ...prev }
              for (const { stkId } of deposited) {
                next[stkId] = (next[stkId] ?? 0) + 1
              }
              if (
                continuousInputActiveRef.current &&
                !anyInboundStkHasCapacity(simulationLine, next)
              ) {
                setWarehouseFullNotice(true)
              }
              return next
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
  }, [allLoadsComplete, beginEndHold, clearTimer, mode, simulationLine, status])

  useEffect(() => {
    if (status !== 'revealing' || finalHoldActive || revealGapActive) return
    if (loadsRef.current.length === 0) return

    clearRevealTimer()
    revealTimerRef.current = window.setInterval(() => {
      if (sequentialRevealActiveRef.current) {
        setRevealSteps((current) => {
          const order = revealOrderRef.current
          const idx = activeRevealIndexRef.current
          const loadId = order[idx]
          if (!loadId) return current
          const load = loadsRef.current.find((item) => item.id === loadId)
          if (!load) return current
          const revealPath = revealPathUnitIdsForLoad(load)
          if (revealPath.length === 0) return current
          const max = revealPath.length - 1
          const step = current[loadId] ?? 0
          if (step >= max) return current
          return { ...current, [loadId]: step + 1 }
        })
        return
      }

      setRevealSteps((current) => {
        const next = { ...current }
        for (const load of loadsRef.current) {
          const revealPath = revealPathUnitIdsForLoad(load)
          const max = revealPath.length - 1
          const step = next[load.id] ?? 0
          if (step < max) next[load.id] = step + 1
        }
        return next
      })
    }, PATH_REVEAL_STEP_MS)

    return clearRevealTimer
  }, [clearRevealTimer, finalHoldActive, revealGapActive, status])

  useEffect(() => {
    if (status !== 'revealing' || finalHoldActive || loads.length === 0) return
    if (sequentialRevealActive) return
    if (!isRevealComplete(revealSteps, loads)) return

    clearRevealTimer()
    setFinalHoldActive(true)
  }, [
    clearRevealTimer,
    finalHoldActive,
    isRevealComplete,
    loads,
    revealSteps,
    sequentialRevealActive,
    status,
  ])

  useEffect(() => {
    if (status !== 'revealing' || finalHoldActive || revealGapActive) return
    if (!sequentialRevealActive || revealOrder.length === 0) return

    const loadId = revealOrder[activeRevealIndex]
    if (!loadId) return

    const load = loads.find((item) => item.id === loadId)
    const revealPath = load ? revealPathUnitIdsForLoad(load) : []
    if (!load || revealPath.length === 0) {
      if (activeRevealIndex + 1 < revealOrder.length) {
        setRevealGapActive(true)
        clearRevealGapTimer()
        revealGapTimerRef.current = window.setTimeout(() => {
          setRevealGapActive(false)
          setActiveRevealIndex((index) => index + 1)
        }, PATH_REVEAL_GAP_MS)
      } else {
        clearRevealTimer()
        setFinalHoldActive(true)
      }
      return
    }

    const max = revealPath.length - 1
    const step = revealSteps[loadId] ?? 0
    if (step < max) return

    clearRevealTimer()
    if (activeRevealIndex + 1 < revealOrder.length) {
      setRevealGapActive(true)
      clearRevealGapTimer()
      revealGapTimerRef.current = window.setTimeout(() => {
        setRevealGapActive(false)
        setActiveRevealIndex((index) => index + 1)
      }, PATH_REVEAL_GAP_MS)
    } else {
      setFinalHoldActive(true)
    }
  }, [
    activeRevealIndex,
    clearRevealGapTimer,
    clearRevealTimer,
    finalHoldActive,
    loads,
    revealGapActive,
    revealOrder,
    revealSteps,
    sequentialRevealActive,
    status,
  ])

  useEffect(() => {
    if (!finalHoldActive || status !== 'revealing' || loads.length === 0) return

    clearFinalHoldTimer()
    finalHoldTimerRef.current = window.setTimeout(() => {
      setFinalHoldActive(false)
      setRevealSteps({})
      setRevealOrder([])
      setActiveRevealIndex(0)
      setSequentialRevealActive(false)
      setRevealGapActive(false)
      setLoads((current) => releaseAllSimulationLoads(current))
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
    setRevealOrder([])
    setActiveRevealIndex(0)
    setSequentialRevealActive(false)
    setRevealGapActive(false)
    setFinalHoldActive(false)
    setEndHoldActive(false)
    clearTackSession()
    clearRevealGapTimer()
    setContinuousInputActive(false)
    setGatherProbes([])
    setStatus('idle')
  }, [clearRevealGapTimer, clearTackSession])

  const changeMode = useCallback((nextMode: PathSimulationMode) => {
    if (nextMode === 'outbound' && !SIM_STK_IO_ENABLED) return
    setMode(nextMode)
    setPlan(null)
    setLoads([])
    setRevealSteps({})
    setRevealOrder([])
    setActiveRevealIndex(0)
    setSequentialRevealActive(false)
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

  const activeUnitIds = useMemo(
    () => activeSimulationUnitIds(loads),
    [loads],
  )
  const simulationUnitMap = useMemo(
    () => new Map(simulationLine.units.map((unit) => [unit.id, unit])),
    [simulationLine],
  )
  const cstUnitIds = useMemo(() => {
    if (status === 'complete') return []
    // 경로 점등 애니메이션 중에만 숨김 — 일시정지(paused)에서는 자재 유지
    if (status === 'revealing' && !finalHoldActive) return []

    const includeCompleted = status === 'endHold' || endHoldActive
    const fromCst = simulationCstUnitIds(loads, {
      includeCompleted,
      unitMap: simulationUnitMap,
    })
    const active = activeSimulationUnitIds(loads)
    return [...new Set([...fromCst, ...active])]
  }, [endHoldActive, finalHoldActive, loads, simulationUnitMap, status])
  const revealHighlightUnitIds = useMemo(() => {
    const revealVisualActive =
      finalHoldActive ||
      status === 'revealing' ||
      (status === 'paused' &&
        loads.length > 0 &&
        loads.some((load) => !load.released))
    if (!revealVisualActive) return []
    if (revealGapActive) return []
    if (sequentialRevealActive && finalHoldActive) return []
    const selected = new Set(selectedSourceUnitIds)
    const scopedLoads = loads.filter((load) => selected.has(load.entryUnitId))
    if (scopedLoads.length === 0) return []
    if (sequentialRevealActive && revealOrder.length > 0) {
      return simulationSequentialRevealUnitIds(
        scopedLoads,
        revealSteps,
        revealOrder,
        activeRevealIndex,
        simulationUnitMap,
      )
    }
    return simulationRevealUnitIds(scopedLoads, revealSteps, simulationUnitMap)
  }, [
    activeRevealIndex,
    finalHoldActive,
    loads,
    revealGapActive,
    revealOrder,
    revealSteps,
    selectedSourceUnitIds,
    sequentialRevealActive,
    simulationUnitMap,
    status,
  ])

  const neonUnitIds = useMemo(() => {
    if (status === 'paused') {
      if (
        !continuousInputActive &&
        loads.length > 0 &&
        !isRevealComplete(revealSteps, loads)
      ) {
        return revealHighlightUnitIds.length > 0
          ? revealHighlightUnitIds
          : cstUnitIds
      }
      return cstUnitIds
    }
    if (finalHoldActive || status === 'revealing') {
      return revealHighlightUnitIds
    }
    return cstUnitIds
  }, [
    continuousInputActive,
    cstUnitIds,
    finalHoldActive,
    isRevealComplete,
    loads,
    revealHighlightUnitIds,
    revealSteps,
    status,
  ])
  const pathUnitIds = useMemo(() => {
    if (loads.length === 0) return []
    const selected = new Set(selectedSourceUnitIds)
    const activeLoads = loads.filter((load) => selected.has(load.entryUnitId))
    if (activeLoads.length === 0) return []
    const revealVisualActive =
      finalHoldActive ||
      status === 'revealing' ||
      (status === 'paused' &&
        activeLoads.some((load) => !load.released))
    if (revealVisualActive) {
      return revealHighlightUnitIds
    }
    return unionSimulationConveyorPathUnitIds(activeLoads, simulationUnitMap)
  }, [
    finalHoldActive,
    loads,
    revealHighlightUnitIds,
    selectedSourceUnitIds,
    simulationUnitMap,
    status,
  ])
  const staticTestMaterialUnitIds = useMemo(
    () => staticTestMaterialOriginUnitIds(line, loads),
    [line, loads],
  )
  const canSimulate =
    sources.length > 0 && selectedSourceUnitIds.length > 0
  const waitingLabels = loads.filter((load) => load.waiting).map((load) => load.label)
  const incompleteLoadCount = useMemo(
    () => countIncompleteSimulationLoads(loads),
    [loads],
  )
  const inboundLineCurrentlyFull = useMemo(() => {
    if (mode !== 'inbound' || selectedSourceUnitIds.length === 0) return false
    return isInboundConveyorLineFull(
      simulationLine,
      loads,
      selectedSourceUnitIds,
      warehouseFillCounts,
    )
  }, [loads, mode, selectedSourceUnitIds, simulationLine, warehouseFillCounts])

  const progressSummary = useMemo(
    () => buildSimulationProgressSummary(loads, incompleteLoadCount),
    [loads, incompleteLoadCount],
  )
  const progressLabel = inboundLineFullBlocked
    ? '라인 만재 · 연속 투입 중지'
    : inboundLineCurrentlyFull && continuousInputActive
      ? '라인 만재 — 추가 투입 대기 중'
      : status === 'revealing' && sequentialRevealActive && revealOrder.length > 0
        ? finalHoldActive
          ? '경로 미리보기 완료 · 자재 투입 시작'
          : revealGapActive
            ? `경로 미리보기 ${activeRevealIndex + 1}/${revealOrder.length} · 전환 중`
            : (() => {
                const loadId = revealOrder[activeRevealIndex]
                const load = loads.find((item) => item.id === loadId)
                const phase = load?.clearsTestMaterial ? '출고' : '투입'
                return `경로 미리보기 ${activeRevealIndex + 1}/${revealOrder.length} · ${phase} ${load?.label ?? ''}`
              })()
        : progressSummary.headline
  const progressDetail = inboundLineFullBlocked
    ? '포트·컨베이어 경로에 자재가 모두 올라갔습니다. STK 만재 상태에서 라인이 가득 차면 연속 투입이 중지됩니다.'
    : progressSummary.detail
  const activeUnitLabel =
    cstUnitIds.length > 0
      ? loads
          .filter((load) => load.pathUnitIds.length > 0)
          .map((load) => load.label)
          .join(', ')
      : null

  const simDestinationByUnitId = useMemo(
    () =>
      buildInboundSimDestinationByUnitId(
        loads,
        cstUnitIds,
        simulationLine.units,
      ),
    [cstUnitIds, loads, simulationLine.units],
  )

  const simulationFlowOverlayLoads = useMemo(() => {
    const useRevealStep =
      !continuousInputActive &&
      loads.length > 0 &&
      !isRevealComplete(revealSteps, loads) &&
      (status === 'revealing' ||
        finalHoldActive ||
        (status === 'paused' && loads.some((load) => !load.released)))

    const overlayLoads =
      loads.length > 0
        ? loads.filter((load) => !load.complete || status === 'endHold')
        : []

    if (overlayLoads.length === 0) return []

    let visibleLoads = overlayLoads
    if (
      sequentialRevealActive &&
      (status === 'revealing' || finalHoldActive) &&
      revealOrder.length > 0 &&
      !revealGapActive &&
      !finalHoldActive
    ) {
      const loadId = revealOrder[activeRevealIndex]
      visibleLoads = loadId
        ? overlayLoads.filter((load) => load.id === loadId)
        : []
    }

    return visibleLoads.map((load) => {
      const revealPath = revealPathUnitIdsForLoad(load)
      const revealStep = revealSteps[load.id] ?? 0

      return {
        pathUnitIds: useRevealStep ? revealPath : load.pathUnitIds,
        stepIndex: useRevealStep ? revealStep : load.stepIndex,
      }
    })
  }, [
    activeRevealIndex,
    continuousInputActive,
    finalHoldActive,
    isRevealComplete,
    isSequentialRevealDone,
    loads,
    revealGapActive,
    revealOrder,
    revealSteps,
    sequentialRevealActive,
    status,
  ])

  /** 포트 저장 핸드쉐이크 완료 시 호출 — 해당 포트에 있는 자재 로드를 경로 시뮬에서 제거 */
  const dischargeLoadAtPort = useCallback((portUnitId: string) => {
    setLoads((prev) =>
      prev.filter((load) => {
        if (load.pathUnitIds.length === 0) return true
        const step = Math.min(Math.max(0, load.stepIndex), load.pathUnitIds.length - 1)
        return load.pathUnitIds[step] !== portUnitId
      }),
    )
  }, [])

  /**
   * OHT PLACE 완료 시 호출 — 투입점(연동 유닛)에 자재를 생성해 경로 계획대로 출발.
   * 투입점이 이미 점유 중이면 스폰하지 않고 false 반환.
   */
  const ohtInjectSeqRef = useRef(0)
  const spawnInboundLoadAtEntry = useCallback(
    (entryUnitId: string): boolean => {
      ohtInjectSeqRef.current += 1
      const load = spawnContinuousInjectLoad(
        simulationLine,
        entryUnitId,
        // 프로브(continuous inject) 시퀀스와 load ID 충돌 방지 오프셋
        100000 + ohtInjectSeqRef.current,
        inboundDestinationByEntryId[entryUnitId] ?? null,
      )
      if (!load) return false
      let spawned = false
      setLoads((prev) => {
        const occupied = prev.some((item) => {
          if (item.pathUnitIds.length === 0) return false
          if (item.complete) return false
          const step = Math.min(
            Math.max(0, item.stepIndex),
            item.pathUnitIds.length - 1,
          )
          return item.pathUnitIds[step] === entryUnitId
        })
        if (occupied) return prev
        spawned = true
        return [...prev, load]
      })
      return spawned
    },
    [simulationLine, inboundDestinationByEntryId],
  )

  // STK 출고 반송 — OUT 포트에서 자재를 받은 뒤 앞 CV→종료점까지 이동할 load 투입
  const outboundSpawnSeqRef = useRef(0)
  const spawnOutboundLoadAtPort = useCallback(
    (portUnitId: string): boolean => {
      outboundSpawnSeqRef.current += 1
      const load = spawnOutboundDischargeLoad(
        simulationLine,
        portUnitId,
        outboundSpawnSeqRef.current,
      )
      if (!load) return false
      setLoads((prev) => {
        // 포트에 이미 자재가 있으면 중복 투입 방지
        const occupied = prev.some((item) => {
          if (item.complete || item.pathUnitIds.length === 0) return false
          const step = Math.min(
            Math.max(0, item.stepIndex),
            item.pathUnitIds.length - 1,
          )
          return item.pathUnitIds[step] === portUnitId
        })
        return occupied ? prev : [...prev, load]
      })
      return true
    },
    [simulationLine],
  )

  return {
    mode,
    changeMode,
    conveyorOnlyLine,
    sources,
    selectedSourceUnitIds,
    toggleSourceUnitId,
    setSelectedSourceUnitIds,
    inboundDestinationByEntryId,
    inboundDestinationsByEntryId,
    setInboundDestinationForEntry,
    plan,
    loads,
    status,
    activeUnitIds,
    cstUnitIds,
    neonUnitIds,
    activeUnitLabel,
    pathUnitIds,
    simulationFlowOverlayLoads,
    simDestinationByUnitId,
    staticTestMaterialUnitIds,
    waitingLabels,
    testMaterialUnits,
    canSimulate,
    progressLabel,
    progressDetail,
    preserveUnitStatus,
    start,
    startContinuous,
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
    turn90Sec,
    setTurn90Sec,
    turn180Sec,
    setTurn180Sec,
    turn270Sec,
    setTurn270Sec,
    dischargeLoadAtPort,
    spawnInboundLoadAtEntry,
    spawnOutboundLoadAtPort,
    incompleteLoadCount,
    tackTimeSummaries,
    continuousInputActive,
    gatherProbes,
    continuousGatherProbes: gatherProbes,
    continuousGatherAnimating:
      status === 'playing' && (continuousInputActive || inboundLineFullBlocked),
    continuousGatherOverlayActive:
      (continuousInputActive || inboundLineFullBlocked) &&
      (status === 'playing' || status === 'paused'),
    continuousInputIntervalSec: continuousInputActive
      ? CONTINUOUS_INPUT_INTERVAL_SEC
      : inputIntervalSec,
    warehouseFillCounts,
    warehouseFullNotice,
    dismissWarehouseFullNotice: () => setWarehouseFullNotice(false),
    stkIoEnabled: SIM_STK_IO_ENABLED,
    inboundLineFullBlocked,
    inboundLineFullNotice,
    inboundLineCurrentlyFull,
    dismissInboundLineFullNotice: () => setInboundLineFullNotice(false),
    storageTargetId,
    entries: sources,
    selectedEntryUnitIds: selectedSourceUnitIds,
    toggleEntryUnitId: toggleSourceUnitId,
  }
}
