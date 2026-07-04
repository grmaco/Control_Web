import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTouchLayout } from '../../hooks/useTouchLayout'
import {
  BUILDER_PALETTE_TYPES,
  typeLabel,
} from '../../constants/conveyorTypes'
import { BUILDER_CELL_SIZE } from '../../constants/grid'
import type { ConveyorLine, ConveyorUnit, FlowRole } from '../../types/conveyor'
import {
  addUnitToLine,
  canPlaceAt,
  findUnitAtCell,
  getFootprintCells,
  getUnitFootprint,
  isUnitAnchor,
  moveUnitInLine,
  moveUnitsInLine,
  canMoveUnitsInLine,
  removeUnitFromLine,
  rotateUnit,
  showsRotation,
  updateUnitInLine,
} from '../../utils/units'
import {
  type BuilderDragData,
  parseCellId,
  type PaletteDragData,
} from './dnd'
import type { OhtSelection } from '../../types/oht'
import { OHT_RAIL_TYPES, ohtRailLabel } from '../../constants/ohtRail'
import {
  addOhtRailToLine,
  addOhtUnitToLine,
  canPlaceOhtRailAt,
  canPlaceOhtUnitAt,
  moveOhtRailInLine,
  moveOhtUnitInLine,
  removeOhtRailFromLine,
  removeOhtUnitFromLine,
  renameOhtUnitInLine,
  rotateOhtRailInLine,
  rotateOhtUnitInLine,
  setOhtUnitRotation,
  getOhtRails,
  getOhtUnits,
} from '../../utils/ohtLayer'
import { OhtRailPaletteItem, OhtUnitPaletteItem } from './OhtPaletteItem'
import { OhtRailLayer } from '../monitor/OhtRailLayer'
import { OhtBuilderPropertiesPanel } from './OhtBuilderPropertiesPanel'
import type { LineViewport } from '../../utils/lineViewport'
import { assignSequentialNamesFromEntries } from '../../utils/sequentialNaming'
import { hasFlowEntries, isFlowCapableUnit, isOutputDestinationCandidate, getEntryUnits, getExitUnits } from '../../utils/flowEntries'
import { syncFlowRoleUnitRole, updatePortPropertiesInLine } from '../../utils/unitPropertyHelpers'
import { getBuilderViewport } from '../../utils/lineViewport'
import { computeMinimapFlowMap } from '../../utils/flowDirection'
import { useConveyorStore } from '../../store/useConveyorStore'
import { GridCell } from './GridCell'
import { PaletteItem } from './PaletteItem'
import { PlacementToolbar } from './PlacementToolbar'
import {
  PaletteDragPreview,
  PlacedUnit,
  UnitDragPreview,
} from './PlacedUnit'
import { UnitPropertiesPanel } from './UnitPropertiesPanel'

const PALETTE_TYPES = BUILDER_PALETTE_TYPES

interface LineBuilderProps {
  line: ConveyorLine
  onSave: (line: ConveyorLine) => Promise<void>
}

export function LineBuilder({ line, onSave }: LineBuilderProps) {
  const [draft, setDraft] = useState(line)
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<BuilderDragData | null>(null)
  const [overCellId, setOverCellId] = useState<string | null>(null)
  const [frozenViewport, setFrozenViewport] = useState<LineViewport | null>(null)
  const [panLocked, setPanLocked] = useState(false)
  const [outputDestinationPickPortId, setOutputDestinationPickPortId] = useState<
    string | null
  >(null)
  const [mobileToolbarOpen, setMobileToolbarOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<'conveyor' | 'oht'>('conveyor')
  const [ohtSelection, setOhtSelection] = useState<OhtSelection | null>(null)
  const touchLayout = useTouchLayout()
  const logApplication = useConveyorStore((s) => s.logApplication)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const selectedUnitIdsRef = useRef(selectedUnitIds)
  selectedUnitIdsRef.current = selectedUnitIds

  useEffect(() => {
    setDraft(line)
    setSelectedUnitIds([])
    setCompletionMessage(null)
    setOutputDestinationPickPortId(null)
    setOhtSelection(null)
  }, [line.id])

  useEffect(() => {
    setDraft((current) =>
      current.id === line.id
        ? {
            ...current,
            name: line.name,
          }
        : current,
    )
  }, [line.id, line.name])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const persist = useCallback(
    async (next: ConveyorLine) => {
      setDraft(next)
      await onSave(next)
    },
    [onSave],
  )

  const selectedUnitIdsSet = useMemo(
    () => new Set(selectedUnitIds),
    [selectedUnitIds],
  )
  const selectedCount = selectedUnitIds.length
  const allSelected =
    selectedCount > 0 && selectedCount === draft.units.length

  const selectedUnit =
    selectedCount === 1
      ? (draft.units.find((u) => u.id === selectedUnitIds[0]) ?? null)
      : null

  const primarySelectedUnit =
    selectedCount > 0
      ? (draft.units.find((u) => u.id === selectedUnitIds[0]) ?? null)
      : null

  const draggingUnit =
    activeDrag?.source === 'grid'
      ? draft.units.find((u) => u.id === activeDrag.unitId)
      : null

  const getDropState = (gridX: number, gridY: number) => {
    if (!activeDrag || !overCellId) {
      return { isValidDrop: false, isInvalidDrop: false }
    }

    const overCell = parseCellId(overCellId)
    if (!overCell) {
      return { isValidDrop: false, isInvalidDrop: false }
    }

    const isOhtDrag =
      activeDrag.source === 'oht-palette' || activeDrag.source === 'oht-grid'

    const footprint =
      activeDrag.source === 'palette'
        ? getUnitFootprint(activeDrag.type)
        : isOhtDrag
          ? { cols: 1, rows: 1 }
          : getUnitFootprint(draggingUnit ?? { type: 'straight' } as ConveyorUnit)

    const footprintCells = getFootprintCells(
      overCell.gridX,
      overCell.gridY,
      footprint,
    )
    const inFootprint = footprintCells.some(
      (cell) => cell.gridX === gridX && cell.gridY === gridY,
    )
    if (!inFootprint) {
      return { isValidDrop: false, isInvalidDrop: false }
    }

    if (isOhtDrag) {
      const kind =
        activeDrag.source === 'oht-palette' ? activeDrag.kind : activeDrag.kind
      const excludeId =
        activeDrag.source === 'oht-grid' ? activeDrag.ohtId : undefined
      const canPlaceOht =
        kind === 'rail'
          ? canPlaceOhtRailAt(draft, overCell.gridX, overCell.gridY, excludeId)
          : canPlaceOhtUnitAt(draft, overCell.gridX, overCell.gridY, excludeId)
      return { isValidDrop: canPlaceOht, isInvalidDrop: !canPlaceOht }
    }

    const canPlace =
      activeDrag.source === 'palette'
        ? canPlaceAt(
            draft.units,
            activeDrag.type,
            overCell.gridX,
            overCell.gridY,
            draft.gridSize.cols,
            draft.gridSize.rows,
          )
        : draggingUnit
          ? selectedUnitIds.length > 1 &&
            selectedUnitIdsSet.has(draggingUnit.id)
            ? canMoveUnitsInLine(
                draft,
                selectedUnitIds,
                draggingUnit.id,
                overCell.gridX,
                overCell.gridY,
              )
            : canPlaceAt(
                draft.units,
                draggingUnit.type,
                overCell.gridX,
                overCell.gridY,
                draft.gridSize.cols,
                draft.gridSize.rows,
                draggingUnit.id,
              )
          : false

    return {
      isValidDrop: canPlace,
      isInvalidDrop: !canPlace,
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setPanLocked(true)
    setActiveDrag(event.active.data.current as BuilderDragData)
    setFrozenViewport(getBuilderViewport(draftRef.current))
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverCellId(event.over?.id ? String(event.over.id) : null)
  }

  const resolveDropCell = (over: DragEndEvent['over']) => {
    if (!over) return null

    const data = over.data.current as { gridX?: number; gridY?: number } | undefined
    if (data?.gridX !== undefined && data?.gridY !== undefined) {
      return { gridX: data.gridX, gridY: data.gridY }
    }

    return parseCellId(String(over.id))
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const dragData = event.active.data.current as BuilderDragData | undefined
    setActiveDrag(null)
    setOverCellId(null)
    setFrozenViewport(null)
    setPanLocked(false)

    if (!dragData) return

    const cell = resolveDropCell(event.over)
    if (!cell) return

    const { gridX, gridY } = cell
    const currentDraft = draftRef.current
    const currentSelectedIds = selectedUnitIdsRef.current
    const currentSelectedSet = new Set(currentSelectedIds)

    if (dragData.source === 'palette') {
      const next = addUnitToLine(currentDraft, dragData.type, gridX, gridY)
      if (!next) return
      await persist(next)
      const placed = next.units.find((u) => u.gridX === gridX && u.gridY === gridY)
      if (placed) setSelectedUnitIds([placed.id])
      return
    }

    if (dragData.source === 'oht-palette') {
      const next =
        dragData.kind === 'rail' && dragData.railType
          ? addOhtRailToLine(currentDraft, dragData.railType, gridX, gridY)
          : dragData.kind === 'unit'
            ? addOhtUnitToLine(currentDraft, gridX, gridY)
            : null
      if (!next) return
      await persist(next)
      const placed =
        dragData.kind === 'rail'
          ? getOhtRails(next).find((r) => r.gridX === gridX && r.gridY === gridY)
          : getOhtUnits(next).find((u) => u.gridX === gridX && u.gridY === gridY)
      if (placed) {
        setSelectedUnitIds([])
        setOhtSelection({ kind: dragData.kind, id: placed.id })
      }
      return
    }

    if (dragData.source === 'oht-grid') {
      const next =
        dragData.kind === 'rail'
          ? moveOhtRailInLine(currentDraft, dragData.ohtId, gridX, gridY)
          : moveOhtUnitInLine(currentDraft, dragData.ohtId, gridX, gridY)
      if (!next) return
      await persist(next)
      setOhtSelection({ kind: dragData.kind, id: dragData.ohtId })
      return
    }

    const isGroupMove =
      currentSelectedIds.length > 1 && currentSelectedSet.has(dragData.unitId)

    const next = isGroupMove
      ? moveUnitsInLine(
          currentDraft,
          currentSelectedIds,
          dragData.unitId,
          gridX,
          gridY,
        )
      : moveUnitInLine(currentDraft, dragData.unitId, gridX, gridY)
    if (!next) return
    await persist(next)
    if (!isGroupMove) {
      setSelectedUnitIds([dragData.unitId])
    }
  }

  const handleDragCancel = () => {
    setActiveDrag(null)
    setOverCellId(null)
    setFrozenViewport(null)
    setPanLocked(false)
  }

  const handleUnitPointerDown = useCallback(() => {
    setPanLocked(true)
  }, [])

  useEffect(() => {
    if (!panLocked || activeDrag) return

    const releasePan = () => setPanLocked(false)
    window.addEventListener('pointerup', releasePan)
    return () => window.removeEventListener('pointerup', releasePan)
  }, [panLocked, activeDrag])

  const handleRotate = useCallback(
    async (unitId: string) => {
      const unit = draft.units.find((u) => u.id === unitId)
      if (!unit) return
      const rotation = rotateUnit(unit)
      if (rotation === null) return
      const next = updateUnitInLine(draft, unitId, { rotation })
      await persist(next)
    },
    [draft, persist],
  )

  const handleDelete = useCallback(
    async (unitId: string) => {
      const next = removeUnitFromLine(draft, unitId)
      await persist({
        ...next,
        updatedAt: new Date().toISOString(),
      })
      setSelectedUnitIds([])
    },
    [draft, persist],
  )

  const handleOhtRotate = useCallback(async () => {
    if (!ohtSelection) return
    const next =
      ohtSelection.kind === 'rail'
        ? rotateOhtRailInLine(draftRef.current, ohtSelection.id)
        : rotateOhtUnitInLine(draftRef.current, ohtSelection.id)
    if (next) await persist(next)
  }, [ohtSelection, persist])

  const handleOhtSetRotation = useCallback(
    async (rotation: 0 | 90 | 180 | 270) => {
      if (ohtSelection?.kind !== 'unit') return
      const next = setOhtUnitRotation(draftRef.current, ohtSelection.id, rotation)
      if (next) await persist(next)
    },
    [ohtSelection, persist],
  )

  const handleOhtDelete = useCallback(async () => {
    if (!ohtSelection) return
    const next =
      ohtSelection.kind === 'rail'
        ? removeOhtRailFromLine(draftRef.current, ohtSelection.id)
        : removeOhtUnitFromLine(draftRef.current, ohtSelection.id)
    await persist(next)
    setOhtSelection(null)
  }, [ohtSelection, persist])

  const handleOhtRename = useCallback(
    async (name: string) => {
      if (ohtSelection?.kind !== 'unit') return
      const next = renameOhtUnitInLine(draftRef.current, ohtSelection.id, name)
      await persist(next)
    },
    [ohtSelection, persist],
  )

  const handleSelectAll = useCallback(() => {
    setSelectedUnitIds(draft.units.map((unit) => unit.id))
  }, [draft.units])

  const handleClearSelection = useCallback(() => {
    setSelectedUnitIds([])
    setOutputDestinationPickPortId(null)
  }, [])

  const handleStartPickOutputDestination = useCallback((portId: string) => {
    setOutputDestinationPickPortId(portId)
    setSelectedUnitIds([portId])
  }, [])

  const handleCancelPickOutputDestination = useCallback(() => {
    setOutputDestinationPickPortId(null)
  }, [])

  const handlePickOutputDestination = useCallback(
    async (portId: string, destinationUnitId: string) => {
      const current = draftRef.current
      const port = current.units.find((item) => item.id === portId)
      if (!port) return
      const destination = current.units.find((item) => item.id === destinationUnitId)
      if (!destination || !isOutputDestinationCandidate(current, destination, portId)) return

      const next = updatePortPropertiesInLine(current, portId, {
        outputDestination: destinationUnitId,
      })
      setDraft(next)
      await persist(next)
      setOutputDestinationPickPortId(null)
      setSelectedUnitIds([portId])

      void logApplication({
        title: 'Button Click',
        comment: `Builder: Port Output Destination ${port.name} → ${destination.name}`,
        lineId: current.id,
      })
    },
    [persist, logApplication],
  )

  const handleSetFlowRole = useCallback(
    async (unitId: string, role: FlowRole | null) => {
      setCompletionMessage(null)
      const unit = draft.units.find((item) => item.id === unitId)
      if (!unit || !isFlowCapableUnit(unit)) return

      const next = updateUnitInLine(
        draft,
        unitId,
        syncFlowRoleUnitRole(unit, { flowRole: role }),
      )
      await persist({
        ...next,
        baseUnitId: null,
        updatedAt: new Date().toISOString(),
      })

      const label =
        role === 'entry' ? 'Entry' : role === 'exit' ? 'Exit' : 'Clear'
      void logApplication({
        title: 'Button Click',
        comment: `Builder: Set Flow Role ${label} ${unit.name}`,
        lineId: draft.id,
      })
    },
    [draft, persist, logApplication],
  )

  const handleCompletePlacement = useCallback(async () => {
    if (!hasFlowEntries(draft)) return

    try {
      const result = assignSequentialNamesFromEntries(draft)
      await persist(result.line)

      void logApplication({
        title: 'Button Click',
        comment: `Builder: Placement Complete (${result.orderedUnitIds.length} units)`,
        lineId: draft.id,
      })

      const summary =
        result.disconnectedUnitIds.length > 0
          ? `배치 완료: ${result.orderedUnitIds.length}개 모듈에 순번을 부여했습니다. 연결되지 않은 ${result.disconnectedUnitIds.length}개는 마지막 순번으로 배치했습니다.`
          : `배치 완료: ${result.orderedUnitIds.length}개 모듈에 투입점 이름 숫자부터 순번을 부여했습니다.`

      setCompletionMessage(summary)
    } catch (error) {
      setCompletionMessage(
        error instanceof Error ? error.message : '순번 부여에 실패했습니다.',
      )
    }
  }, [draft, persist, logApplication])

  useEffect(() => {
    if (activeDrag?.source === 'palette') {
      setMobileToolbarOpen(false)
    }
  }, [activeDrag])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return
      }
      if (e.key === 'Escape' && outputDestinationPickPortId) {
        e.preventDefault()
        setOutputDestinationPickPortId(null)
        return
      }
      // OHT 레이어 선택 시 R 회전 · Delete 삭제
      if (ohtSelection) {
        if (e.key.toLowerCase() === 'r' && ohtSelection.kind === 'rail') {
          e.preventDefault()
          void handleOhtRotate()
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          void handleOhtDelete()
          return
        }
      }
      if (e.key.toLowerCase() !== 'r' || selectedCount !== 1 || !selectedUnit) return
      if (!showsRotation(selectedUnit.type)) return
      e.preventDefault()
      handleRotate(selectedUnit.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    outputDestinationPickPortId,
    selectedCount,
    selectedUnit,
    handleRotate,
    ohtSelection,
    handleOhtRotate,
    handleOhtDelete,
  ])

  const activeUnit: ConveyorUnit | null =
    activeDrag?.source === 'grid'
      ? (draft.units.find((u) => u.id === activeDrag.unitId) ?? null)
      : null

  const computedViewport = useMemo(() => getBuilderViewport(draft), [draft])
  const viewport = frozenViewport ?? computedViewport
  const unitFlowMap = useMemo(() => computeMinimapFlowMap(draft), [draft])
  const canCompletePlacement = draft.units.length > 0 && hasFlowEntries(draft)
  const mobileEntryLabel = useMemo(() => {
    const entries = getEntryUnits(draft)
    return entries.length > 0 ? entries.map((unit) => unit.name).join(', ') : '미지정'
  }, [draft])
  const mobileExitLabel = useMemo(() => {
    const exits = getExitUnits(draft)
    return exits.length > 0 ? exits.map((unit) => unit.name).join(', ') : '미지정'
  }, [draft])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={{
        droppable: { strategy: MeasuringStrategy.Always },
      }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_240px]">
        <aside className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-300">팔레트</h3>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-md border border-slate-700 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setPaletteMode('conveyor')}
              className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                paletteMode === 'conveyor'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              컨베이어
            </button>
            <button
              type="button"
              onClick={() => setPaletteMode('oht')}
              className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                paletteMode === 'oht'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              OHT
            </button>
          </div>
          {paletteMode === 'conveyor' ? (
            <>
              <ul className="grid grid-cols-2 gap-2 lg:block lg:space-y-2">
                {PALETTE_TYPES.map((type) => (
                  <PaletteItem key={type} type={type} />
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                팔레트 항목을 그리드 빈 칸으로 드래그해 배치하세요.
              </p>
            </>
          ) : (
            <>
              <ul className="space-y-2">
                {OHT_RAIL_TYPES.map((railType) => (
                  <OhtRailPaletteItem key={railType} railType={railType} />
                ))}
                <OhtUnitPaletteItem />
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                OHT 레일·대차를 맵 위로 드래그해 배치하세요. 레일은 컨베이어 위에
                겹쳐지는 별도 레이어입니다.
              </p>
            </>
          )}
        </aside>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm lg:mb-3">
            <span className="max-w-[55%] truncate text-slate-300">{draft.name}</span>
            <span className="text-xs text-slate-500 lg:text-sm">
              {viewport.cols}×{viewport.rows} · {draft.units.length}유닛
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {outputDestinationPickPortId ? (
              <p className="order-0 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                출고구 CV 선택 중 — 캔버스에서 CV를 클릭하세요 (Esc 취소)
              </p>
            ) : null}

            <div
              className={
                touchLayout
                  ? 'order-1 h-[min(520px,52vh)] overflow-hidden rounded border border-slate-800 bg-slate-950'
                  : 'order-2 h-[520px] overflow-hidden rounded border border-slate-800 bg-slate-950'
              }
            >
              <TransformWrapper
                limitToBounds={false}
                minScale={0.2}
                maxScale={4}
                smooth
                wheel={{ step: 0.004 }}
                panning={{
                  velocityDisabled: true,
                  disabled: panLocked || activeDrag !== null,
                  excluded: ['builder-no-pan'],
                }}
                doubleClick={{ disabled: true }}
              >
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                  <div className="relative inline-block">
                  <div
                    className="inline-grid gap-0 select-none"
                    style={{
                      gridTemplateColumns: `repeat(${viewport.cols}, ${BUILDER_CELL_SIZE}px)`,
                      gridTemplateRows: `repeat(${viewport.rows}, ${BUILDER_CELL_SIZE}px)`,
                    }}
                    onClick={() => {
                      if (outputDestinationPickPortId) {
                        setOutputDestinationPickPortId(null)
                      }
                      setSelectedUnitIds([])
                      setOhtSelection(null)
                    }}
                  >
            {Array.from({ length: viewport.cols * viewport.rows }).map((_, index) => {
              const localX = index % viewport.cols
              const localY = Math.floor(index / viewport.cols)
              const gridX = viewport.minX + localX
              const gridY = viewport.minY + localY
              const cellKey = `cell-${gridX}-${gridY}`
              const unit = findUnitAtCell(draft.units, gridX, gridY)
              const isAnchor = unit ? isUnitAnchor(unit, gridX, gridY) : false
              const footprint = unit ? getUnitFootprint(unit) : null
              const dropState = getDropState(gridX, gridY)

              return (
                <GridCell
                  key={cellKey}
                  gridX={gridX}
                  gridY={gridY}
                  cellSize={BUILDER_CELL_SIZE}
                  occupied={Boolean(unit)}
                  overflowVisible={Boolean(isAnchor && footprint && (footprint.cols > 1 || footprint.rows > 1))}
                  {...dropState}
                >
                  {isAnchor && unit ? (
                    <PlacedUnit
                      unit={unit}
                      selected={selectedUnitIdsSet.has(unit.id)}
                      showLabels
                      cellSize={BUILDER_CELL_SIZE}
                      footprint={footprint ?? undefined}
                      flow={unitFlowMap.get(unit.id) ?? null}
                      pickHighlight={
                        outputDestinationPickPortId === unit.id
                          ? 'source'
                          : outputDestinationPickPortId &&
                              isOutputDestinationCandidate(
                                draft,
                                unit,
                                outputDestinationPickPortId,
                              )
                            ? 'target'
                            : null
                      }
                      dragEnabled={
                        !outputDestinationPickPortId &&
                        (selectedCount <= 1 || selectedUnitIdsSet.has(unit.id))
                      }
                      onPanLock={handleUnitPointerDown}
                      onSelect={() => {
                        if (outputDestinationPickPortId) {
                          if (
                            isOutputDestinationCandidate(
                              draft,
                              unit,
                              outputDestinationPickPortId,
                            )
                          ) {
                            void handlePickOutputDestination(
                              outputDestinationPickPortId,
                              unit.id,
                            )
                          }
                          return
                        }
                        setSelectedUnitIds((prev) => {
                          if (prev.length > 1) {
                            if (prev.includes(unit.id)) {
                              return prev.filter((id) => id !== unit.id)
                            }
                            return [...prev, unit.id]
                          }
                          return [unit.id]
                        })
                      }}
                    />
                  ) : null}
                </GridCell>
              )
            })}
                  </div>
                  <OhtRailLayer
                    line={draft}
                    viewport={{
                      minX: viewport.minX,
                      minY: viewport.minY,
                      cols: viewport.cols,
                      rows: viewport.rows,
                    }}
                    cellSize={BUILDER_CELL_SIZE}
                    interactive={paletteMode === 'oht'}
                    selection={ohtSelection}
                    onSelect={(selection) => {
                      setSelectedUnitIds([])
                      setOhtSelection(selection)
                    }}
                  />
                  </div>
                </TransformComponent>
              </TransformWrapper>
            </div>

            <div className={touchLayout ? 'order-2' : 'order-1'}>
              {touchLayout ? (
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileToolbarOpen((open) => !open)}
                    className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200"
                  >
                    <span className="shrink-0 font-medium">배치 도구</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                      투입 {mobileEntryLabel} · 출고 {mobileExitLabel}
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {mobileToolbarOpen ? '▲' : '▼'}
                    </span>
                  </button>
                  {!mobileToolbarOpen ? (
                    <button
                      type="button"
                      disabled={!canCompletePlacement}
                      onClick={handleCompletePlacement}
                      className="min-h-[40px] shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      배치 완료
                    </button>
                  ) : null}
                </div>
              ) : null}

              {!touchLayout || mobileToolbarOpen ? (
                <PlacementToolbar
                  line={draft}
                  selectedUnit={primarySelectedUnit}
                  selectedCount={selectedCount}
                  allSelected={allSelected}
                  completionMessage={completionMessage}
                  onSetFlowRole={handleSetFlowRole}
                  onComplete={handleCompletePlacement}
                  onSelectAll={handleSelectAll}
                  onClearSelection={handleClearSelection}
                />
              ) : null}
            </div>
          </div>

          {!touchLayout ? (
            <p className="mt-2 text-xs text-slate-500">
              배치된 영역 중심 작업 화면 · 저장 맵 {draft.gridSize.cols}×
              {draft.gridSize.rows} · 빈 칸 드래그로 맵 이동 · 모듈 드래그로 배치 변경
            </p>
          ) : null}
        </section>

        <aside className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          {!touchLayout ? (
            <h3 className="mb-3 text-sm font-medium text-slate-300">속성</h3>
          ) : null}
          {ohtSelection ? (
            <OhtBuilderPropertiesPanel
              line={draft}
              selection={ohtSelection}
              onRotate={handleOhtRotate}
              onSetRotation={handleOhtSetRotation}
              onDelete={handleOhtDelete}
              onRename={handleOhtRename}
            />
          ) : (
            <UnitPropertiesPanel
              line={draft}
              unit={selectedUnit}
              selectedUnitIds={selectedUnitIds}
              onChange={persist}
              onDelete={handleDelete}
              onRotate={handleRotate}
              outputDestinationPickPortId={outputDestinationPickPortId}
              onStartPickOutputDestination={handleStartPickOutputDestination}
              onCancelPickOutputDestination={handleCancelPickOutputDestination}
            />
          )}
        </aside>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag?.source === 'palette' ? (
          <PaletteDragPreview
            label={typeLabel((activeDrag as PaletteDragData).type)}
          />
        ) : activeDrag?.source === 'oht-palette' ? (
          <PaletteDragPreview
            label={
              activeDrag.kind === 'rail' && activeDrag.railType
                ? ohtRailLabel(activeDrag.railType)
                : 'OHT 대차'
            }
          />
        ) : activeDrag?.source === 'oht-grid' ? (
          <PaletteDragPreview label={activeDrag.kind === 'rail' ? 'OHT 레일' : 'OHT 대차'} />
        ) : activeUnit ? (
          <UnitDragPreview unit={activeUnit} cellSize={BUILDER_CELL_SIZE} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
