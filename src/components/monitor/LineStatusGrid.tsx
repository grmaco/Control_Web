import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isPortUnit, isStorageUnit, unitTitle } from '../../constants/conveyorTypes'
import type { ConveyorLine, ConveyorUnit } from '../../types/conveyor'
import { STATUS_COLORS } from '../../constants/statusColors'
import { useMonitorStore } from '../../store/useMonitorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import type { LineViewport } from '../../utils/lineViewport'
import {
  computeMinimapFlowMap,
  flowEntryDir,
  flowExitDir,
  overlaySimulationPathOnFlowMap,
  simulationPathFlowRole,
  unitTravelDir,
  type UnitFlowDirs,
} from '../../utils/flowDirection'
import { getUnitFootprint, footprintBorderClasses, isUnitAnchor } from '../../utils/unitFootprint'
import { lineLayoutSignature } from '../../utils/lineLayoutSignature'
import { buildUnitLabelLines, LABEL_LINE_HEIGHT } from '../../utils/monitorLabel'
import { unitShowsMinimapMaterial } from '../../utils/unitMaterial'
import { MinimapFlowArrow, MinimapPortFallback, MinimapStorageLabel } from './MinimapFlowArrow'
import { FlowCalloutOverlay, FLOW_CALLOUT_PANEL_CLASS, FLOW_UNIT_PEEK_HIT_CLASS } from './FlowCalloutLayer'
import { computeFlowCallouts, computeCalloutForUnit } from '../../utils/flowCallouts'
import { RollerConveyorCell } from './RollerConveyorCell'
import { TurnConveyorCell } from './TurnConveyorCell'
import { StorageConveyorCell } from './StorageConveyorCell'
import { ContinuousInputGatherOverlay } from './ContinuousInputGatherOverlay'
import type { GatherProbeState } from '../../utils/continuousInputGather'
import type { PathSimulationLoad } from '../../types/unitProperties'
import { useTouchLayout } from '../../hooks/useTouchLayout'
import { OhtRailLayer } from './OhtRailLayer'
import { OhtVehicleOverlay } from './OhtVehicleOverlay'
import type { OhtRailGraph, OhtVehicleState } from '../../utils/ohtSimulation'
import { StorageSimCalloutOverlay } from './PortStorageSimOverlay'
import type { StorageSimState, PortSimState } from '../../hooks/usePortStorageSimulation'

interface LineStatusGridProps {
  line: ConveyorLine
  cellSize: number
  viewport?: LineViewport
  showLabels?: boolean
  /** 미니맵 등 — CV 물류 순서 화살표 */
  showFlowArrows?: boolean
  /** 모니터링 맵 전용 — 시작/종료/회전 콜아웃 표 */
  showFlowCallouts?: boolean
  /** 줌 배율 — 라벨 크기 계산에 사용 */
  scale?: number
  /** 셀 격자 실선 표시 */
  showGridLines?: boolean
  /** 모듈 이름 숨김 (적재창고 포함) */
  hideModuleNames?: boolean
  /** 경로 시뮬 — 화살표 네온 점등 대상 (시작 점등 또는 현재 자재 위치) */
  simulationNeonUnitIds?: string[]
  /** 경로 시뮬레이션 — 자재(CST) 현재 위치 (셀 링 하이라이트) */
  simulationActiveUnitIds?: string[]
  /** 시뮬 중 출발 칸에만 남는 테스트 자재 (이동 시작 후 제외) */
  simulationStaticTestMaterialUnitIds?: string[]
  simulationInProgress?: boolean
  /** 경로 시뮬레이션 — 자재별 진행 (flow 오버레이) */
  simulationLoads?: Array<{ pathUnitIds: string[]; stepIndex: number }>
  /** 콜아웃 LD/ULD/BUSY — 전체 시뮬 load 상태 */
  simulationCalloutLoads?: PathSimulationLoad[]
  simulationInputIntervalSec?: number
  simulationTransitIntervalSec?: number
  simulationDischargeIntervalSec?: number
  /** 경로 시뮬레이션 — 계획 경로 하이라이트 */
  simulationPathUnitIds?: string[]
  /** 콜아웃 드래그 중 맵 패닝 잠금 */
  /** 연속 투입 — 프로브·미네랄 수집 오버레이 */
  continuousGatherProbes?: GatherProbeState[]
  continuousInputActive?: boolean
  continuousInputIntervalSec?: number
  continuousGatherAnimating?: boolean
  /** 연속 투입 오버레이 표시 — 라인 만재 중지 시에도 포트 수집 연출 유지 */
  continuousGatherOverlayActive?: boolean
  /** 연속 투입 — 적재창고 슬롯 채움 수 */
  warehouseFillCounts?: Record<string, number>
  onCalloutPanLockChange?: (locked: boolean) => void
  /** 증가 시 콜아웃 선택 해제 */
  calloutDeselectToken?: number
  /** 투입점별 시뮬 목적지 이름 (콜아웃 표시) */
  simDestinationByUnitId?: Record<string, string>
  /** 모니터링 2.5D 시점 표현 */
  is25DView?: boolean
  /** OHT 레일 오버레이 표시 (표시 전용) */
  showOhtRails?: boolean
  /** OHT 시뮬 대차 (애니메이션) */
  ohtVehicles?: OhtVehicleState[]
  ohtGraph?: OhtRailGraph
  ohtSimActive?: boolean
  ohtStepMs?: number
  ohtPoodleMode?: boolean
  /** 포트/창고 시뮬레이션 */
  portStorageSimActive?: boolean
  storageSimStates?: Record<string, StorageSimState>
  portSimStates?: Record<string, PortSimState>
  onStorageSimClick?: (storageId: string) => void
  onStorageSimDoubleClick?: (storageId: string) => void
  hiddenStorageCalloutIds?: Set<string>
  className?: string
}

function resolveSimulationUnitFlow(
  line: ConveyorLine,
  unitId: string,
  simulationLoads: Array<{ pathUnitIds: string[]; stepIndex: number }>,
  flowMap: Map<string, UnitFlowDirs>,
): UnitFlowDirs | null {
  const activeLoad = [...simulationLoads]
    .reverse()
    .find((load) => load.pathUnitIds[load.stepIndex] === unitId)

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const unit = unitMap.get(unitId)
  if (!unit) return null

  if (activeLoad) {
    const pathIndex = activeLoad.stepIndex
    if (activeLoad.pathUnitIds[pathIndex] !== unitId) {
      return flowMap.get(unitId) ?? null
    }

    const prev = pathIndex > 0 ? unitMap.get(activeLoad.pathUnitIds[pathIndex - 1]!) : null
    const next =
      pathIndex < activeLoad.pathUnitIds.length - 1
        ? unitMap.get(activeLoad.pathUnitIds[pathIndex + 1]!)
        : null

    const inDir = prev ? flowEntryDir(prev, unit) : null
    const outDir = next ? flowExitDir(unit, next) : null
    const existing = flowMap.get(unitId)

    if (isPortUnit(unit)) {
      if (!inDir && !outDir) return existing ?? null
      return {
        inDir,
        outDir,
        cvNumber: existing?.cvNumber ?? null,
        role: simulationPathFlowRole(unit, inDir, outDir, existing),
        portDirection: existing?.portDirection ?? unit.portDirection ?? 'IN',
      }
    }

    if (!inDir && !outDir) return existing ?? null

    return {
      inDir,
      outDir,
      cvNumber: existing?.cvNumber ?? null,
      role: simulationPathFlowRole(unit, inDir, outDir, existing),
      portDirection: existing?.portDirection,
    }
  }

  return flowMap.get(unitId) ?? null
}

function storageFootprintOutlineClass(
  unit: ConveyorUnit,
  isSimActive: boolean,
  isOnSimPath: boolean,
): string {
  if (isSimActive) {
    return 'border-2 border-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.65)]'
  }
  if (isOnSimPath) {
    return 'border-[0.5px] border-violet-400/80'
  }
  return `border-[0.5px] ${STATUS_COLORS[unit.status].border}`
}

export function LineStatusGrid({
  line,
  cellSize,
  viewport,
  showLabels = true,
  showFlowArrows = false,
  showFlowCallouts = false,
  scale = 1,
  showGridLines = false,
  hideModuleNames = false,
  simulationNeonUnitIds = [],
  simulationActiveUnitIds = [],
  simulationStaticTestMaterialUnitIds = [],
  simulationInProgress = false,
  simulationLoads = [],
  simulationCalloutLoads = [],
  simulationInputIntervalSec,
  simulationTransitIntervalSec,
  simulationDischargeIntervalSec,
  simulationPathUnitIds = [],
  onCalloutPanLockChange,
  calloutDeselectToken = 0,
  simDestinationByUnitId = {},
  is25DView = false,
  continuousGatherProbes = [],
  continuousInputActive = false,
  continuousInputIntervalSec = 0.5,
  continuousGatherAnimating = false,
  continuousGatherOverlayActive,
  warehouseFillCounts = {},
  showOhtRails = false,
  ohtVehicles = [],
  ohtGraph,
  ohtSimActive = false,
  ohtStepMs = 600,
  ohtPoodleMode = false,
  portStorageSimActive = false,
  storageSimStates,
  portSimStates,
  onStorageSimClick,
  onStorageSimDoubleClick,
  hiddenStorageCalloutIds,
  className,
}: LineStatusGridProps) {
  // 창고 싱글/더블 클릭 구분 타이머 (200ms 내 2번 = 더블클릭)
  const storageClickTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const layoutSignature = useMemo(() => lineLayoutSignature(line), [line])
  const unitByCell = useMemo(() => {
    const map = new Map<string, ConveyorUnit>()
    for (const unit of line.units) {
      const footprint = getUnitFootprint(unit)
      for (let dy = 0; dy < footprint.rows; dy += 1) {
        for (let dx = 0; dx < footprint.cols; dx += 1) {
          map.set(`${unit.gridX + dx},${unit.gridY + dy}`, unit)
        }
      }
    }
    return map
  }, [layoutSignature, line.units])
  const simulationPathSet = useMemo(
    () => new Set(simulationPathUnitIds),
    [simulationPathUnitIds],
  )
  const simulationNeonSet = useMemo(
    () => new Set(simulationNeonUnitIds),
    [simulationNeonUnitIds],
  )
  const simulationActiveSet = useMemo(
    () => new Set(simulationActiveUnitIds),
    [simulationActiveUnitIds],
  )
  const staticTestMaterialSet = useMemo(
    () => new Set(simulationStaticTestMaterialUnitIds),
    [simulationStaticTestMaterialUnitIds],
  )
  const minX = viewport?.minX ?? 0
  const minY = viewport?.minY ?? 0
  const cols = viewport?.cols ?? line.gridSize.cols
  const rows = viewport?.rows ?? line.gridSize.rows
  // 롤러 방향 애니메이션에도 필요하므로 항상 계산
  const flowByUnitId = useMemo(() => {
    let result = computeMinimapFlowMap(line)
    if (simulationLoads.length === 0) return result
    const sortedLoads = [...simulationLoads].sort((a, b) => a.stepIndex - b.stepIndex)
    for (const load of sortedLoads) {
      result = overlaySimulationPathOnFlowMap(
        line,
        result,
        load.pathUnitIds,
        load.stepIndex,
      )
    }
    return result
  }, [layoutSignature, line, simulationLoads])
  const unitById = useMemo(
    () => new Map(line.units.map((unit) => [unit.id, unit])),
    [layoutSignature, line.units],
  )
  const viewportBounds = useMemo(
    () => ({ minX, minY, cols, rows, maxX: minX + cols - 1, maxY: minY + rows - 1 }),
    [minX, minY, cols, rows],
  )
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const unitAlarms = useSemiCnvStore((s) => s.unitAlarms)
  const flowCallouts = useMemo(() => {
    if (!showFlowCallouts || flowByUnitId.size === 0) return []
    const alarmUnitIds = Object.keys(unitAlarms).length > 0 ? new Set(Object.keys(unitAlarms)) : undefined
    return computeFlowCallouts(line, flowByUnitId, viewportBounds, cellSize, alarmUnitIds, unitAlarms)
  }, [cellSize, flowByUnitId, layoutSignature, line, showFlowCallouts, viewportBounds, unitAlarms])
  const calloutByUnitId = useMemo(
    () => new Map(flowCallouts.map((callout) => [callout.unitId, callout])),
    [flowCallouts],
  )
  const [pinnedUnitIds, setPinnedUnitIds] = useState<ReadonlySet<string>>(new Set())
  /** 더블클릭으로 숨긴 초기 콜아웃 ID 집합 */
  const [hiddenCalloutIds, setHiddenCalloutIds] = useState<ReadonlySet<string>>(new Set())
  const touchLayout = useTouchLayout()

  useEffect(() => {
    if (calloutDeselectToken > 0) {
      setPinnedUnitIds(new Set())
      setHiddenCalloutIds(new Set())
    }
  }, [calloutDeselectToken])

  const handleUnitPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, unitId: string) => {
      event.stopPropagation()
      setPinnedUnitIds((current) => {
        const next = new Set(current)
        if (next.has(unitId)) next.delete(unitId)
        else next.add(unitId)
        return next
      })
    },
    [],
  )

  const handleUnitDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, unitId: string) => {
      event.stopPropagation()
      setHiddenCalloutIds((current) => {
        const next = new Set(current)
        if (next.has(unitId)) next.delete(unitId)
        else next.add(unitId)
        return next
      })
    },
    [],
  )

  const peekUnitIds = useMemo(() => [...pinnedUnitIds], [pinnedUnitIds])

  const visibleCallouts = useMemo(() => {
    if (!showFlowCallouts) return []

    // 더블클릭으로 숨긴 초기 콜아웃 제외
    const merged = new Map(
      flowCallouts
        .filter((callout) => !hiddenCalloutIds.has(callout.unitId))
        .map((callout) => [callout.unitId, callout]),
    )

    for (const unitId of peekUnitIds) {
      if (merged.has(unitId)) continue
      const cached = calloutByUnitId.get(unitId)
      if (cached) {
        merged.set(unitId, cached)
        continue
      }
      const unit = unitById.get(unitId)
      if (!unit) continue
      const flow = flowByUnitId.get(unitId)
      const created = computeCalloutForUnit(
        unit,
        flow,
        line,
        viewportBounds,
        cellSize,
        unitAlarms,
        flowCallouts,
      )
      if (created) merged.set(unitId, created)
    }

    return [...merged.values()]
  }, [
    calloutByUnitId,
    cellSize,
    flowByUnitId,
    flowCallouts,
    hiddenCalloutIds,
    line,
    peekUnitIds,
    showFlowCallouts,
    unitAlarms,
    unitById,
    viewportBounds,
  ])

  const lineView = useMonitorStore((s) => s.lineViews[line.id] ?? null)
  const saveCalloutPositions = useMonitorStore((s) => s.saveCalloutPositions)
  const savedCalloutPositions = useMemo(() => {
    if (lineView?.layoutSignature !== layoutSignature) return undefined
    return lineView.calloutPositions
  }, [layoutSignature, lineView])
  const handleSaveCalloutPositions = useCallback(
    (positions: Record<string, { panelX: number; panelY: number }>) => {
      saveCalloutPositions(line.id, layoutSignature, positions)
    },
    [layoutSignature, line.id, saveCalloutPositions],
  )

  return (
    <div
      className={`relative overflow-visible transition-transform duration-300 ${className ?? ''}`}
      onPointerLeave={undefined}
      style={
        is25DView
          ? {
              transform: 'perspective(1200px) rotateX(52deg) rotateZ(-34deg) scale(0.9)',
              transformOrigin: 'center center',
            }
          : undefined
      }
    >
      <div
        className={`inline-grid gap-0 overflow-visible bg-slate-900/60 ${
          showGridLines ? 'border border-slate-700' : ''
        }`}
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
        }}
      >
      {Array.from({ length: cols * rows }).map((_, index) => {
        const localX = index % cols
        const localY = Math.floor(index / cols)
        const gridX = minX + localX
        const gridY = minY + localY
        const unit = unitByCell.get(`${gridX},${gridY}`)
        const colors = unit ? STATUS_COLORS[unit.status] : null
        const isAnchor = unit ? isUnitAnchor(unit, gridX, gridY) : false
        const footprint = unit ? getUnitFootprint(unit) : null
        const isMultiCell = footprint !== null && (footprint.cols > 1 || footprint.rows > 1)
        const isMultiCellAnchor = isAnchor && isMultiCell
        const isPort = unit != null && isPortUnit(unit)
        const flow =
          unit && isAnchor && showFlowArrows
            ? resolveSimulationUnitFlow(line, unit.id, simulationLoads, flowByUnitId) ??
              flowByUnitId.get(unit.id) ??
              null
            : null
        const showMinimapPortOverlay =
          showFlowArrows && isAnchor && isPort
        const showMinimapStorageLabel =
          showFlowArrows &&
          isMultiCellAnchor &&
          unit != null &&
          isStorageUnit(unit) &&
          !hideModuleNames
        const showUnitLabel =
          unit &&
          showLabels &&
          isAnchor &&
          !hideModuleNames &&
          !isStorageUnit(unit) &&
          !(showFlowArrows && isPort && flow) &&
          !showMinimapStorageLabel
        const label = showUnitLabel
          ? buildUnitLabelLines(
              unit,
              cellSize,
              scale,
              footprint?.cols ?? 1,
              footprint?.rows ?? 1,
            )
          : null
        const spanWidth = footprint ? footprint.cols * cellSize : cellSize
        const spanHeight = footprint ? footprint.rows * cellSize : cellSize
        const isSimActive = unit != null && simulationActiveSet.has(unit.id)
        const isOnSimPath = unit != null && simulationPathSet.has(unit.id)
        const isStorage = unit != null && isStorageUnit(unit)
        const showStorageOutline =
          isStorage && isMultiCellAnchor && unit != null && footprint != null
        const showSimMaterial = Boolean(
          unit &&
            unitShowsMinimapMaterial(unit, unitRuntime, {
              simulating: simulationInProgress,
              simulationCstActive: simulationNeonSet.has(unit.id),
              staticTestAtOrigin: staticTestMaterialSet.has(unit.id),
            }),
        )

        const isTurn = unit?.type === 'turn' || unit?.type === 'junction'
        const useRollerSvg   = Boolean(unit && isAnchor && !isStorage && !isTurn)
        const useTurnSvg     = Boolean(unit && isAnchor && isTurn)
        const useStorageSvg  = Boolean(unit && isAnchor && isStorage)

        return (
          <div
            key={`${gridX}-${gridY}`}
            style={{ width: cellSize, height: cellSize }}
            className={`flex h-full w-full min-w-0 flex-col items-center justify-center ${
              isPort && isAnchor ? 'p-0' : 'p-0.5'
            } ${
              unit
                ? footprintBorderClasses(unit, gridX, gridY)
                : showGridLines
                  ? 'border-[0.5px]'
                  : ''
            } relative ${
              isMultiCellAnchor
                ? 'z-10 overflow-visible'
                : isMultiCell && unit
                  ? 'z-0 overflow-hidden'
                  : flow && !isPort
                    ? 'overflow-visible'
                    : 'overflow-hidden'
            } ${
              isOnSimPath && isAnchor && !isStorage
                ? 'ring-1 ring-inset ring-violet-400/70'
                : ''
            } ${
              isSimActive && isAnchor && !isStorage
                ? 'ring-2 ring-inset ring-cyan-300'
                : ''
            } ${
              unit
                ? (useRollerSvg || useTurnSvg || useStorageSvg)
                  ? `${colors!.border} text-white`
                  : `${colors!.bg} ${colors!.border} text-white`
                : showGridLines
                  ? 'border-slate-800 bg-slate-900/80 text-slate-600'
                  : 'bg-slate-900/80 text-slate-600'
            }`}
            title={isAnchor && unit ? unitTitle(unit) : undefined}
          >
            {showFlowCallouts && unit ? (
              <div
                className={`${FLOW_UNIT_PEEK_HIT_CLASS} absolute inset-0 z-[30] touch-none`}
                aria-hidden
                onPointerDown={(event) => handleUnitPointerDown(event, unit.id)}
                onDoubleClick={(event) => handleUnitDoubleClick(event, unit.id)}
              />
            ) : null}
            {useRollerSvg && unit && (
              <RollerConveyorCell
                width={spanWidth}
                height={spanHeight}
                status={unit.status}
                rotation={unit.rotation ?? 0}
                flowOutDir={unitTravelDir(flowByUnitId.get(unit.id) ?? { inDir: null, outDir: null })}
                isRunning={unit.status === 'running'}
                uid={`${unit.id}-${gridX}-${gridY}`}
              />
            )}
            {useTurnSvg && unit && (
              <TurnConveyorCell
                width={spanWidth}
                height={spanHeight}
                status={unit.status}
                rotation={unit.rotation ?? 0}
                flowInDir={flow?.inDir ?? null}
                flowOutDir={flow?.outDir ?? null}
                isRunning={unit.status === 'running'}
                uid={`${unit.id}-${gridX}-${gridY}`}
                isJunction={unit.type === 'junction'}
              />
            )}
            {useTurnSvg && unit && showSimMaterial ? (
              <div
                className="pointer-events-none absolute inset-1 z-[8] rounded-sm ring-2 ring-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.75)]"
                aria-hidden
              />
            ) : null}
            {useRollerSvg && unit && showSimMaterial && !flow ? (
              <div
                className="pointer-events-none absolute inset-1 z-[8] rounded-sm ring-2 ring-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.75)]"
                aria-hidden
              />
            ) : null}
            {useStorageSvg && unit && (
              <StorageConveyorCell
                width={spanWidth}
                height={spanHeight}
                status={unit.status}
                uid={`${unit.id}-${gridX}-${gridY}`}
                filledSlotCount={
                  portStorageSimActive && storageSimStates?.[unit.id] != null
                    ? (storageSimStates[unit.id]!.filledSlots)
                    : (warehouseFillCounts[unit.id] ?? 0)
                }
              />
            )}
            {/* 창고 시뮬 COMPLETE 파란박스 */}
            {portStorageSimActive && isStorage && isMultiCellAnchor && unit &&
              storageSimStates?.[unit.id]?.status === 'COMPLETE' ? (
              <div
                className="pointer-events-none absolute top-0 left-0 z-[6] box-border rounded-sm border-2 border-blue-400 bg-blue-400/12 shadow-[0_0_18px_rgba(96,165,250,0.7)]"
                style={{ width: spanWidth, height: spanHeight }}
                aria-hidden
              />
            ) : null}
            {/* 창고 클릭 → 포트 선택 / 더블클릭 → 콜아웃 토글 (시뮬 중) */}
            {portStorageSimActive && isStorage && isMultiCellAnchor &&
              (onStorageSimClick ?? onStorageSimDoubleClick) ? (
              <div
                className="absolute top-0 left-0 z-[31] cursor-pointer touch-none"
                style={{ width: spanWidth, height: spanHeight }}
                aria-hidden
                onClick={(e) => {
                  e.stopPropagation()
                  const uid = unit!.id
                  const existing = storageClickTimersRef.current.get(uid)
                  if (existing) {
                    // 두 번째 클릭 → 더블클릭
                    clearTimeout(existing)
                    storageClickTimersRef.current.delete(uid)
                    onStorageSimDoubleClick?.(uid)
                  } else {
                    // 첫 번째 클릭 — 200ms 내 두 번째가 없으면 싱글클릭
                    const timer = setTimeout(() => {
                      storageClickTimersRef.current.delete(uid)
                      onStorageSimClick?.(uid)
                    }, 200)
                    storageClickTimersRef.current.set(uid, timer)
                  }
                }}
              />
            ) : null}
            {flow && unit && !isStorageUnit(unit) ? (
              <MinimapFlowArrow
                unitType={unit.type}
                flow={flow}
                rotation={unit.rotation}
                unitName={unit.name}
                showUnitName={!hideModuleNames}
                cellSize={cellSize}
                hasMaterial={showSimMaterial}
                filterId={`neon-${unit.id.replace(/[^a-zA-Z0-9_-]/g, '')}`}
              />
            ) : showFlowArrows && isAnchor && unit && isPortUnit(unit) ? (
              <MinimapPortFallback
                unit={unit}
                cellSize={cellSize}
                showName={!hideModuleNames}
                flow={flowByUnitId.get(unit.id) ?? null}
                hasMaterial={showSimMaterial}
              />
            ) : null}
            {showStorageOutline ? (
              <div
                className={`pointer-events-none absolute top-0 left-0 z-[4] box-border ${storageFootprintOutlineClass(
                  unit,
                  isSimActive,
                  isOnSimPath,
                )}`}
                style={{
                  width: spanWidth,
                  height: spanHeight,
                }}
                aria-hidden
              />
            ) : null}
            {showMinimapStorageLabel && unit && footprint ? (
              <MinimapStorageLabel
                name={unit.name}
                cellSize={cellSize}
                footprintCols={footprint.cols}
                footprintRows={footprint.rows}
              />
            ) : null}
            {label && label.lines.length > 0 ? (
              <div
                className={`flex flex-col items-center justify-center overflow-hidden ${
                  isMultiCellAnchor
                    ? 'absolute top-0 left-0 z-10'
                    : 'relative z-10 h-full w-full min-h-0 min-w-0 max-w-full'
                }`}
                style={{
                  width: isMultiCellAnchor ? spanWidth : undefined,
                  height: isMultiCellAnchor ? spanHeight : undefined,
                  fontSize: label.fontSize,
                  lineHeight: LABEL_LINE_HEIGHT,
                }}
              >
                {label.lines.map((text, lineIndex) => (
                  <span
                    key={lineIndex}
                    className={`block w-full max-w-full overflow-hidden text-center whitespace-nowrap ${
                      lineIndex === 0
                        ? 'font-semibold'
                        : lineIndex === 1
                          ? 'text-white/70'
                          : 'text-white/60'
                    }`}
                  >
                    {text}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
      </div>
      {showOhtRails ? (
        <OhtRailLayer
          line={line}
          viewport={{ minX, minY, cols, rows }}
          cellSize={cellSize}
          interactive={false}
        />
      ) : null}
      {ohtGraph && ohtVehicles.length > 0 ? (
        <OhtVehicleOverlay
          vehicles={ohtVehicles}
          graph={ohtGraph}
          viewport={{ minX, minY, cols, rows }}
          cellSize={cellSize}
          active={ohtSimActive}
          stepMs={ohtStepMs}
          poodleMode={ohtPoodleMode}
        />
      ) : null}
      <ContinuousInputGatherOverlay
        active={
          (continuousGatherOverlayActive ?? continuousInputActive) && simulationInProgress
        }
        animating={continuousGatherAnimating}
        probes={continuousGatherProbes}
        line={line}
        cellSize={cellSize}
        minX={minX}
        minY={minY}
        gridWidth={cols * cellSize}
        gridHeight={rows * cellSize}
        inputIntervalSec={continuousInputIntervalSec}
      />
      {portStorageSimActive && storageSimStates ? (
        <StorageSimCalloutOverlay
          storageStates={storageSimStates}
          line={line}
          viewport={{ minX, minY, cols, rows }}
          cellSize={cellSize}
          scale={scale}
          hiddenIds={hiddenStorageCalloutIds}
        />
      ) : null}
      {showFlowCallouts && visibleCallouts.length > 0 ? (
        <FlowCalloutOverlay
          callouts={visibleCallouts}
          peekUnitIds={pinnedUnitIds}
          unitById={unitById}
          flowByUnitId={flowByUnitId}
          unitRuntime={unitRuntime}
          gridWidth={cols * cellSize}
          gridHeight={rows * cellSize}
          scale={scale}
          savedPositions={savedCalloutPositions}
          onSavePositions={handleSaveCalloutPositions}
          onPanLockChange={onCalloutPanLockChange}
          deselectToken={calloutDeselectToken}
          activeUnitIds={simulationActiveSet}
          staticTestMaterialUnitIds={staticTestMaterialSet}
          simulating={simulationInProgress}
          simDestinationByUnitId={simDestinationByUnitId}
          simulationLoads={simulationCalloutLoads}
          inputIntervalSec={simulationInputIntervalSec}
          transitIntervalSec={simulationTransitIntervalSec}
          dischargeIntervalSec={simulationDischargeIntervalSec}
          continuousInputActive={continuousInputActive}
          portSimStates={portSimStates}
        />
      ) : null}
    </div>
  )
}
