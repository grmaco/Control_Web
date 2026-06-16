import { useDraggable } from '@dnd-kit/core'
import type { ConveyorType } from '../../types/conveyor'
import { isDualModule, typeDescription, typeLabel } from '../../constants/conveyorTypes'
import { paletteId, type PaletteDragData } from './dnd'

interface PaletteItemProps {
  type: ConveyorType
}

export function PaletteItem({ type }: PaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: paletteId(type),
    data: { source: 'palette', type } satisfies PaletteDragData,
  })

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded border border-dashed border-slate-600 bg-slate-800/80 px-3 py-2 active:cursor-grabbing ${
        isDragging ? 'opacity-40' : 'hover:border-blue-500 hover:bg-slate-800'
      }`}
    >
      <div className="text-sm text-slate-200">{typeLabel(type)}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">
        {isDualModule(type) ? '2모듈 겹침 · ' : ''}
        {typeDescription(type)}
      </div>
    </li>
  )
}
