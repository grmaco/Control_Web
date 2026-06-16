import { useDraggable } from '@dnd-kit/core'
import type { ConveyorUnit } from '../../types/conveyor'
import { STATUS_COLORS } from '../../constants/statusColors'
import { showsRotation, typeLabel, unitTitle } from '../../constants/conveyorTypes'
import { type GridDragData, unitDragId } from './dnd'

interface PlacedUnitProps {
  unit: ConveyorUnit
  selected: boolean
  isBase: boolean
  onSelect: () => void
}

export function PlacedUnit({ unit, selected, isBase, onSelect }: PlacedUnitProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: unitDragId(unit.id),
    data: { source: 'grid', unitId: unit.id } satisfies GridDragData,
  })

  const colors = STATUS_COLORS[unit.status]

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
      className={`absolute inset-0 flex h-full w-full cursor-grab flex-col items-center justify-center border p-0.5 text-[10px] leading-tight active:cursor-grabbing ${
        colors.bg
      } ${colors.border} ${selected ? 'ring-2 ring-inset ring-white' : ''} ${
        isBase ? 'ring-2 ring-inset ring-amber-400' : ''
      } ${isDragging ? 'opacity-30' : 'hover:brightness-110'}`}
      title={isBase ? `${unitTitle(unit)} · 기준` : unitTitle(unit)}
    >
      {isBase && (
        <span className="absolute top-0.5 left-0.5 rounded bg-amber-500 px-0.5 text-[8px] font-bold text-slate-900">
          기준
        </span>
      )}
      <span className="font-semibold text-white">{unit.name}</span>
      <span className="text-white/70">{typeLabel(unit.type)}</span>
      {showsRotation(unit.type) && (
        <span className="text-white/60">{unit.rotation}°</span>
      )}
    </button>
  )
}

export function UnitDragPreview({ unit }: { unit: ConveyorUnit }) {
  const colors = STATUS_COLORS[unit.status]
  return (
    <div
      className={`flex h-12 w-12 flex-col items-center justify-center rounded border text-[10px] shadow-lg ${colors.bg} ${colors.border}`}
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
