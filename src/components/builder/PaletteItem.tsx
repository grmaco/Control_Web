import { useDraggable } from '@dnd-kit/core'
import type { ConveyorType } from '../../types/conveyor'
import { typeDescription, typeLabel } from '../../constants/conveyorTypes'
import { paletteId, type PaletteDragData } from './dnd'
import { ConveyorTypeGlyph } from './ConveyorTypeGlyph'

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
      style={{ touchAction: 'none' }}
      className={`flex min-h-[52px] cursor-grab items-center gap-2 rounded border border-dashed border-slate-600 bg-slate-800/80 px-2 py-2.5 text-left active:cursor-grabbing lg:px-3 ${
        isDragging ? 'opacity-40' : 'hover:border-blue-500 hover:bg-slate-800'
      }`}
    >
      <span className="shrink-0 rounded bg-slate-950/60 p-0.5">
        <ConveyorTypeGlyph type={type} size={30} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{typeLabel(type)}</span>
        <span className="mt-0.5 hidden whitespace-pre-line text-[11px] text-slate-500 lg:block">
          {typeDescription(type)}
        </span>
      </span>
    </li>
  )
}
