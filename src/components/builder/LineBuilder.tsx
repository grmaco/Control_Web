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
import type { LineViewport } from '../../utils/lineViewport'
import { assignSequentialNamesFromEntries } from '../../utils/sequentialNaming'
import { hasFlowEntries, isFlowCapableUnit, isOutputDestinationCandidate } from '../../utils/flowEntries'
import { isStkRoutingSourceUnit, updatePortPropertiesInLine } from '../../utils/unitPropertyHelpers'
import {
  isCellInRoutingPath,
  routingTooltipForUnit,
  simulateStkRouting,
} from '../../utils/routingSimulation'
import type { RoutingSimulationResult } from '../../types/unitProperties'
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
  const [routingSimulation, setRoutingSimulation] =
    useState<RoutingSimulationResult | null>(null)
  const [routingSimulationMessage, setRoutingSimulationMessage] = useState<
    string | null
  >(null)
  const [activeDrag, setActiveDrag] = useState<BuilderDragData | null>(null)
  const [overCellId, setOverCellId] = useState<string | null>(null)
  const [frozenViewport, setFrozenViewport] = useState<LineViewport | null>(null)
  const [panLocked, setPanLocked] = useState(false)
  const [outputDestinationPickPortId, setOutputDestinationPickPortId] = useState<
    string | null
  >(null)
  const logApplication = useConveyorStore((s) => s.logApplication)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const selectedUnitIdsRef = useRef(selectedUnitIds)
  selectedUnitIdsRef.current = selectedUnitIds

  useEffect(() => {
    setDraft(line)
    setSelectedUnitIds([])
    setCompletionMessage(null)
    setRoutingSimulation(null)
    setRoutingSimulationMessage(null)
    setOutputDestinationPickPortId(null)
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

    const footprint =
      activeDrag.source === 'palette'
        ? getUnitFootprint(activeDrag.type)
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

      const next = updateUnitInLine(draft, unitId, { flowRole: role })
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

  const canRoutingSimulation =
    selectedCount === 1 &&
    selectedUnit != null &&
    isStkRoutingSourceUnit(selectedUnit)

  const handleRoutingSimulation = useCallback(() => {
    if (!selectedUnit) return
    const result = simulateStkRouting(draft, selectedUnit.id)
    setRoutingSimulation(result)
    setRoutingSimulationMessage(result.message)
  }, [draft, selectedUnit])

  const handleClearRoutingSimulation = useCallback(() => {
    setRoutingSimulation(null)
    setRoutingSimulationMessage(null)
  }, [])

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return
      }
      if (e.key === 'Escape' && outputDestinationPickPortId) {
        e.preventDefault()
        setOutputDestinationPickPortId(null)
        return
      }
      if (e.key.toLowerCase() !== 'r' || selectedCount !== 1 || !selectedUnit) return
      if (!showsRotation(selectedUnit.type)) return
      e.preventDefault()
      handleRotate(selectedUnit.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [outputDestinationPickPortId, selectedCount, selectedUnit, handleRotate])

  const activeUnit: ConveyorUnit | null =
    activeDrag?.source === 'grid'
      ? (draft.units.find((u) => u.id === activeDrag.unitId) ?? null)
      : null

  const computedViewport = useMemo(() => getBuilderViewport(draft), [draft])
  const viewport = frozenViewport ?? computedViewport
  const unitFlowMap = useMemo(() => computeMinimapFlowMap(draft), [draft])

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
          <ul className="grid grid-cols-2 gap-2 lg:block lg:space-y-2">
            {PALETTE_TYPES.map((type) => (
              <PaletteItem key={type} type={type} />
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            팔레트 항목을 그리드 빈 칸으로 드래그해 배치하세요.
          </p>
        </aside>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-300">{draft.name}</span>
            <span className="text-slate-500">
              작업 영역 {viewport.cols}×{viewport.rows} · {draft.units.length} /{' '}
              {draft.gridSize.cols * draft.gridSize.rows} 유닛
            </span>
          </div>

          <PlacementToolbar
            line={draft}
            selectedUnit={primarySelectedUnit}
            selectedCount={selectedCount}
            allSelected={allSelected}
            completionMessage={completionMessage}
            canRoutingSimulation={canRoutingSimulation}
            routingSimulationMessage={routingSimulationMessage}
            onSetFlowRole={handleSetFlowRole}
            onComplete={handleCompletePlacement}
            onRoutingSimulation={handleRoutingSimulation}
            onClearRoutingSimulation={handleClearRoutingSimulation}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
          />

          {outputDestinationPickPortId ? (
            <p className="mb-2 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
              출고구 CV 선택 중 — 캔버스에서 CV를 클릭하세요 (Esc 취소)
            </p>
          ) : null}
          <div className="h-[520px] overflow-hidden rounded border border-slate-800 bg-slate-950">
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
                      routingHighlighted={isCellInRoutingPath(unit.id, routingSimulation)}
                      routingTooltip={routingTooltipForUnit(unit.id, routingSimulation)}
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
              </TransformComponent>
            </TransformWrapper>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            배치된 영역 중심 작업 화면 · 저장 맵 {draft.gridSize.cols}×
            {draft.gridSize.rows} · 빈 칸 드래그로 맵 이동 · 모듈 드래그로 배치 변경
          </p>
        </section>

        <aside className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-300">속성</h3>
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
        </aside>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag?.source === 'palette' ? (
          <PaletteDragPreview
            label={typeLabel((activeDrag as PaletteDragData).type)}
          />
        ) : activeUnit ? (
          <UnitDragPreview unit={activeUnit} cellSize={BUILDER_CELL_SIZE} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
