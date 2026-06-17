import { useDraggable } from '@dnd-kit/core'
import type { ConveyorUnit } from '../../types/conveyor'
import { STATUS_COLORS } from '../../constants/statusColors'
import {
  isPortUnit,
  isStorageUnit,
  showsRotation,
  showsTypeLabelInCell,
  formatRotationDisplay,
  typeLabel,
  unitTitle,
} from '../../constants/conveyorTypes'
import type { UnitFootprint } from '../../utils/unitFootprint'
import { type GridDragData, unitDragId } from './dnd'

interface PlacedUnitProps {
  unit: ConveyorUnit
  selected: boolean
  isBase: boolean
  showLabels?: boolean
  cellSize: number
  footprint?: UnitFootprint
  onSelect: () => void
}

export function PlacedUnit({
  unit,
  selected,
  isBase,
  showLabels = true,
  cellSize,
  footprint = { cols: 1, rows: 1 },
  onSelect,
}: PlacedUnitProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: unitDragId(unit.id),
    data: { source: 'grid', unitId: unit.id } satisfies GridDragData,
  })

  const colors = STATUS_COLORS[unit.status]
  const isPort = isPortUnit(unit)
  const isStorage = isStorageUnit(unit)
  const spanWidth = footprint.cols * cellSize
  const spanHeight = footprint.rows * cellSize

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      style={{
        width: spanWidth,
        height: spanHeight,
      }}
      className={`absolute top-0 left-0 flex cursor-grab flex-col items-center justify-center border p-1 text-[10px] leading-tight active:cursor-grabbing ${colors.bg} ${colors.border} ${selected ? 'ring-2 ring-inset ring-white' : ''} ${
        isBase ? 'ring-2 ring-inset ring-violet-400' : ''
      } ${isDragging ? 'opacity-30' : 'hover:brightness-110'}`}
      title={isBase ? `${unitTitle(unit)} · 기준` : unitTitle(unit)}
    >
      {isBase && showLabels && (
        <span className="absolute top-0.5 left-0.5 rounded bg-violet-600 px-0.5 text-[8px] font-bold text-white">
          기준
        </span>
      )}
      {showLabels ? (
        <>
          <span className="font-semibold text-white">{unit.name}</span>
          {isPort ? (
            <span className="text-white/70">{unit.portDirection ?? 'IN'}</span>
          ) : isStorage ? null : (
            <>
              {showsTypeLabelInCell(unit.type) && (
                <span className="text-white/70">{typeLabel(unit.type)}</span>
              )}
              {showsRotation(unit.type) && (
                <span className="text-white/60">{formatRotationDisplay(unit)}</span>
              )}
            </>
          )}
        </>
      ) : null}
    </button>
  )
}

export function UnitDragPreview({
  unit,
  cellSize = 36,
}: {
  unit: ConveyorUnit
  cellSize?: number
}) {
  const colors = STATUS_COLORS[unit.status]
  const isStorage = isStorageUnit(unit)
  const footprint = isStorage ? { cols: 3, rows: 3 } : { cols: 1, rows: 1 }

  return (
    <div
      style={{
        width: footprint.cols * cellSize,
        height: footprint.rows * cellSize,
      }}
      className={`flex flex-col items-center justify-center rounded border text-[10px] shadow-lg ${colors.bg} ${colors.border}`}
    >
      <span className="font-semibold text-white">{unit.name}</span>
    </div>
  )
}

export function PaletteDragPreview({ label }: { label: string }) {
  return (
    <div className="rounded border border-blue-500 bg-slate-800 px-3 py-2 text-sm text-white shadow-lg">
      {label}
    </div>
  )
}
