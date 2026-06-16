import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useCallback, useEffect, useState } from 'react'
import {
  CONVEYOR_TYPES,
  typeDescription,
  typeLabel,
} from '../../constants/conveyorTypes'
import type { ConveyorLine, ConveyorUnit } from '../../types/conveyor'
import {
  addUnitToLine,
  isCellOccupied,
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
import { assignSequentialNamesFromBase } from '../../utils/sequentialNaming'
import { GridCell } from './GridCell'
import { PaletteItem } from './PaletteItem'
import { PlacementToolbar } from './PlacementToolbar'
import {
  PaletteDragPreview,
  PlacedUnit,
  UnitDragPreview,
} from './PlacedUnit'
import { UnitPropertiesPanel } from './UnitPropertiesPanel'

const PALETTE_TYPES = CONVEYOR_TYPES

interface LineBuilderProps {
  line: ConveyorLine
  onSave: (line: ConveyorLine) => Promise<void>
}

export function LineBuilder({ line, onSave }: LineBuilderProps) {
  const [draft, setDraft] = useState(line)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [baseUnitId, setBaseUnitId] = useState<string | null>(null)
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<BuilderDragData | null>(null)
  const [overCellId, setOverCellId] = useState<string | null>(null)

  useEffect(() => {
    setDraft(line)
    setSelectedUnitId(null)
    setBaseUnitId(null)
    setCompletionMessage(null)
  }, [line.id])

  useEffect(() => {
    setDraft((current) =>
      current.id === line.id ? { ...current, name: line.name } : current,
    )
  }, [line.id, line.name])

  useEffect(() => {
    if (baseUnitId && !draft.units.some((unit) => unit.id === baseUnitId)) {
      setBaseUnitId(null)
    }
  }, [baseUnitId, draft.units])

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

  const draggingUnitId =
    activeDrag?.source === 'grid' ? activeDrag.unitId : undefined

  const getDropState = (gridX: number, gridY: number, cellKey: string) => {
    if (!activeDrag || overCellId !== cellKey) {
      return { isValidDrop: false, isInvalidDrop: false }
    }

    const occupied = isCellOccupied(draft.units, gridX, gridY, draggingUnitId)
    return {
      isValidDrop: !occupied,
      isInvalidDrop: occupied,
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDrag(event.active.data.current as BuilderDragData)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverCellId(event.over?.id ? String(event.over.id) : null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const dragData = event.active.data.current as BuilderDragData | undefined
    const overId = event.over?.id ? String(event.over.id) : null
    setActiveDrag(null)
    setOverCellId(null)

    if (!dragData || !overId) return

    const cell = parseCellId(overId)
    if (!cell) return

    const { gridX, gridY } = cell

    if (dragData.source === 'palette') {
      const next = addUnitToLine(draft, dragData.type, gridX, gridY)
      if (!next) return
      await persist(next)
      const placed = next.units.find((u) => u.gridX === gridX && u.gridY === gridY)
      if (placed) setSelectedUnitId(placed.id)
      return
    }

    const next = moveUnitInLine(draft, dragData.unitId, gridX, gridY)
    if (!next) return
    await persist(next)
    setSelectedUnitId(dragData.unitId)
  }

  const handleDragCancel = () => {
    setActiveDrag(null)
    setOverCellId(null)
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
      await persist(next)
      setSelectedUnitId(null)
      if (baseUnitId === unitId) setBaseUnitId(null)
    },
    [draft, persist, baseUnitId],
  )

  const handleSetBase = useCallback((unitId: string) => {
    setBaseUnitId(unitId)
    setCompletionMessage(null)
  }, [])

  const handleCompletePlacement = useCallback(async () => {
    if (!baseUnitId) return

    try {
      const result = assignSequentialNamesFromBase(draft, baseUnitId)
      await persist(result.line)

      const summary =
        result.disconnectedUnitIds.length > 0
          ? `배치 완료: ${result.orderedUnitIds.length}개 모듈에 순번을 부여했습니다. 연결되지 않은 ${result.disconnectedUnitIds.length}개는 마지막 순번으로 배치했습니다.`
          : `배치 완료: ${result.orderedUnitIds.length}개 모듈에 CV-01부터 순번을 부여했습니다.`

      setCompletionMessage(summary)
    } catch (error) {
      setCompletionMessage(
        error instanceof Error ? error.message : '순번 부여에 실패했습니다.',
      )
    }
  }, [baseUnitId, draft, persist])

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

  return (
    <DndContext
      sensors={sensors}
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
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-slate-300">{draft.name}</span>
            <span className="text-slate-500">
              {draft.units.length} / {draft.gridSize.cols * draft.gridSize.rows} 유닛
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

          <div
            className="grid gap-0 select-none border border-slate-800"
            style={{
              gridTemplateColumns: `repeat(${draft.gridSize.cols}, minmax(0, 1fr))`,
            }}
            onClick={() => setSelectedUnitId(null)}
          >
            {Array.from({
              length: draft.gridSize.cols * draft.gridSize.rows,
            }).map((_, index) => {
              const gridX = index % draft.gridSize.cols
              const gridY = Math.floor(index / draft.gridSize.cols)
              const cellKey = `cell-${gridX}-${gridY}`
              const unit = draft.units.find(
                (u) => u.gridX === gridX && u.gridY === gridY,
              )
              const dropState = getDropState(gridX, gridY, cellKey)

              return (
                <GridCell
                  key={cellKey}
                  gridX={gridX}
                  gridY={gridY}
                  occupied={Boolean(unit)}
                  {...dropState}
                >
                  {unit ? (
                    <PlacedUnit
                      unit={unit}
                      selected={selectedUnitId === unit.id}
                      isBase={baseUnitId === unit.id}
                      onSelect={() => setSelectedUnitId(unit.id)}
                    />
                  ) : null}
                </GridCell>
              )
            })}
          </div>
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
          <UnitDragPreview unit={activeUnit} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
