import { useCallback, useMemo } from 'react'
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
import { FlowCalloutOverlay } from './FlowCalloutLayer'
import { computeFlowCallouts } from '../../utils/flowCallouts'
import { RollerConveyorCell } from './RollerConveyorCell'
import { TurnConveyorCell } from './TurnConveyorCell'
import { StorageConveyorCell } from './StorageConveyorCell'

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
  /** 적재창고(STK) 제외 모듈 이름 숨김 */
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
  /** 경로 시뮬레이션 — 계획 경로 하이라이트 */
  simulationPathUnitIds?: string[]
  /** 콜아웃 드래그 중 맵 패닝 잠금 */
  onCalloutPanLockChange?: (locked: boolean) => void
  /** 증가 시 콜아웃 선택 해제 */
  calloutDeselectToken?: number
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
  if (!activeLoad) return flowMap.get(unitId) ?? null

  const pathIndex = activeLoad.stepIndex
  if (activeLoad.pathUnitIds[pathIndex] !== unitId) {
    return flowMap.get(unitId) ?? null
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const unit = unitMap.get(unitId)
  if (!unit) return null

  // 포트(IN/OUT) 삼각형은 STK·LOAD UNIT 기준 고정 — 경로 오버레이 시 방향이 뒤집히지 않도록 유지
  if (isPortUnit(unit)) {
    return flowMap.get(unitId) ?? null
  }

  const prev = pathIndex > 0 ? unitMap.get(activeLoad.pathUnitIds[pathIndex - 1]!) : null
  const next =
    pathIndex < activeLoad.pathUnitIds.length - 1
      ? unitMap.get(activeLoad.pathUnitIds[pathIndex + 1]!)
      : null

  const inDir = prev ? flowEntryDir(prev, unit) : null
  const outDir = next ? flowExitDir(unit, next) : null
  if (!inDir && !outDir) return flowMap.get(unitId) ?? null

  const existing = flowMap.get(unitId)
  return {
    inDir,
    outDir,
    cvNumber: existing?.cvNumber ?? null,
    role: simulationPathFlowRole(unit, inDir, outDir, existing),
    portDirection: existing?.portDirection,
  }
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
  simulationPathUnitIds = [],
  onCalloutPanLockChange,
  calloutDeselectToken = 0,
  className,
}: LineStatusGridProps) {
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
    <div className={`relative overflow-visible ${className ?? ''}`}>
      <div
        className={`inline-grid gap-0 overflow-visible bg-slate-950/50 ${
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
          showFlowArrows && isMultiCellAnchor && unit != null && isStorageUnit(unit)
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
                  ? 'border-slate-800 bg-slate-900/60 text-slate-600'
                  : 'bg-slate-900/60 text-slate-600'
            }`}
            title={isAnchor && unit ? unitTitle(unit) : undefined}
          >
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
            {useTurnSvg && unit && showSimMaterial && !flow ? (
              <div
                className="pointer-events-none absolute inset-1 z-[6] rounded-sm ring-2 ring-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.75)]"
                aria-hidden
              />
            ) : null}
            {useStorageSvg && unit && (
              <StorageConveyorCell
                width={spanWidth}
                height={spanHeight}
                status={unit.status}
                uid={`${unit.id}-${gridX}-${gridY}`}
              />
            )}
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
      {showFlowCallouts && flowCallouts.length > 0 ? (
        <FlowCalloutOverlay
          callouts={flowCallouts}
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
        />
      ) : null}
    </div>
  )
}
