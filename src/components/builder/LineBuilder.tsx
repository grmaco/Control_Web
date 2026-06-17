import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BUILDER_PALETTE_TYPES,
  typeDescription,
  typeLabel,
} from '../../constants/conveyorTypes'
import { BUILDER_CELL_SIZE } from '../../constants/grid'
import type { ConveyorLine, ConveyorUnit } from '../../types/conveyor'
import {
  addUnitToLine,
  canPlaceAt,
  findUnitAtCell,
  getFootprintCells,
  getUnitFootprint,
  isUnitAnchor,
  moveUnitInLine,
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
import { assignSequentialNamesFromBase } from '../../utils/sequentialNaming'
import { getBuilderViewport } from '../../utils/lineViewport'
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
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<BuilderDragData | null>(null)
  const [overCellId, setOverCellId] = useState<string | null>(null)
  const [frozenViewport, setFrozenViewport] = useState<LineViewport | null>(null)
  const logApplication = useConveyorStore((s) => s.logApplication)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const baseUnitId = draft.baseUnitId ?? null

  useEffect(() => {
    setDraft(line)
    setSelectedUnitId(null)
    setCompletionMessage(null)
  }, [line.id])

  useEffect(() => {
    setDraft((current) =>
      current.id === line.id
        ? {
            ...current,
            name: line.name,
            baseUnitId: line.baseUnitId ?? null,
          }
        : current,
    )
  }, [line.id, line.name, line.baseUnitId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const persist = useCallback(
    async (next: ConveyorLine) => {
      setDraft(next)
      await onSave(next)
    },
    [onSave],
  )

  const selectedUnit =
    draft.units.find((u) => u.id === selectedUnitId) ?? null

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
          ? canPlaceAt(
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

    if (!dragData) return

    const cell = resolveDropCell(event.over)
    if (!cell) return

    const { gridX, gridY } = cell
    const currentDraft = draftRef.current

    if (dragData.source === 'palette') {
      const next = addUnitToLine(currentDraft, dragData.type, gridX, gridY)
      if (!next) return
      await persist(next)
      const placed = next.units.find((u) => u.gridX === gridX && u.gridY === gridY)
      if (placed) setSelectedUnitId(placed.id)
      return
    }

    const next = moveUnitInLine(currentDraft, dragData.unitId, gridX, gridY)
    if (!next) return
    await persist(next)
    setSelectedUnitId(dragData.unitId)
  }

  const handleDragCancel = () => {
    setActiveDrag(null)
    setOverCellId(null)
    setFrozenViewport(null)
  }

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
        baseUnitId: draft.baseUnitId === unitId ? null : (draft.baseUnitId ?? null),
        updatedAt: new Date().toISOString(),
      })
      setSelectedUnitId(null)
    },
    [draft, persist],
  )

  const handleSetBase = useCallback(
    async (unitId: string) => {
      setCompletionMessage(null)
      const unit = draft.units.find((item) => item.id === unitId)
      await persist({
        ...draft,
        baseUnitId: unitId,
        updatedAt: new Date().toISOString(),
      })
      void logApplication({
        title: 'Button Click',
        comment: `Builder: Set Base Unit ${unit?.name ?? unitId}`,
        lineId: draft.id,
      })
    },
    [draft, persist, logApplication],
  )

  const handleCompletePlacement = useCallback(async () => {
    if (!baseUnitId) return

    try {
      const result = assignSequentialNamesFromBase(draft, baseUnitId)
      await persist(result.line)

      void logApplication({
        title: 'Button Click',
        comment: `Builder: Placement Complete (${result.orderedUnitIds.length} units)`,
        lineId: draft.id,
      })

      const summary =
        result.disconnectedUnitIds.length > 0
          ? `배치 완료: ${result.orderedUnitIds.length}개 모듈에 순번을 부여했습니다. 연결되지 않은 ${result.disconnectedUnitIds.length}개는 마지막 순번으로 배치했습니다.`
          : `배치 완료: ${result.orderedUnitIds.length}개 모듈에 기준 이름 숫자부터 순번을 부여했습니다.`

      setCompletionMessage(summary)
    } catch (error) {
      setCompletionMessage(
        error instanceof Error ? error.message : '순번 부여에 실패했습니다.',
      )
    }
  }, [baseUnitId, draft, persist, logApplication])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r' || !selectedUnitId) return
      const unit = draft.units.find((u) => u.id === selectedUnitId)
      if (!unit || !showsRotation(unit.type)) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return
      }
      e.preventDefault()
      handleRotate(selectedUnitId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedUnitId, handleRotate, draft.units])

  const activeUnit: ConveyorUnit | null =
    activeDrag?.source === 'grid'
      ? (draft.units.find((u) => u.id === activeDrag.unitId) ?? null)
      : null

  const computedViewport = useMemo(() => getBuilderViewport(draft), [draft])
  const viewport = frozenViewport ?? computedViewport

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
      <div className="grid gap-4 lg:grid-cols-[200px_1fr_240px]">
        <aside className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-300">팔레트</h3>
          <ul className="space-y-2">
            {PALETTE_TYPES.map((type) => (
              <PaletteItem key={type} type={type} />
            ))}
          </ul>
          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            {PALETTE_TYPES.map((type) => (
              <li key={type}>
                <span className="text-slate-400">{typeLabel(type)}</span> —{' '}
                {typeDescription(type)}
              </li>
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
            units={draft.units}
            selectedUnit={selectedUnit}
            baseUnitId={baseUnitId}
            completionMessage={completionMessage}
            onSetBase={handleSetBase}
            onComplete={handleCompletePlacement}
          />

          <div className="max-h-[520px] overflow-auto rounded border border-slate-800">
            <div
              className="inline-grid gap-0 select-none"
              style={{
                gridTemplateColumns: `repeat(${viewport.cols}, ${BUILDER_CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${viewport.rows}, ${BUILDER_CELL_SIZE}px)`,
              }}
              onClick={() => setSelectedUnitId(null)}
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
                      selected={selectedUnitId === unit.id}
                      isBase={baseUnitId === unit.id}
                      showLabels
                      cellSize={BUILDER_CELL_SIZE}
                      footprint={footprint ?? undefined}
                      onSelect={() => setSelectedUnitId(unit.id)}
                    />
                  ) : null}
                </GridCell>
              )
            })}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            배치된 영역 중심 작업 화면 · 저장 맵 {draft.gridSize.cols}×
            {draft.gridSize.rows} · 드래그 시 가장자리로 작업 영역 확장
          </p>
        </section>

        <aside className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-300">속성</h3>
          <UnitPropertiesPanel
            line={draft}
            unit={selectedUnit}
            isBase={selectedUnit ? baseUnitId === selectedUnit.id : false}
            onSetBase={handleSetBase}
            onChange={persist}
            onDelete={handleDelete}
            onRotate={handleRotate}
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
