import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { cellId } from './dnd'

interface GridCellProps {
  gridX: number
  gridY: number
  cellSize?: number
  occupied: boolean
  isValidDrop: boolean
  isInvalidDrop: boolean
  children?: ReactNode
}

export function GridCell({
  gridX,
  gridY,
  cellSize,
  occupied,
  isValidDrop,
  isInvalidDrop,
  children,
}: GridCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(gridX, gridY),
    data: { gridX, gridY },
  })

  return (
    <div
      ref={setNodeRef}
      style={
        cellSize
          ? { width: cellSize, height: cellSize }
          : undefined
      }
      className={`relative overflow-hidden ${
        cellSize ? '' : 'aspect-square'
      } ${
        isOver && isValidDrop
          ? 'bg-emerald-950/40 ring-2 ring-inset ring-emerald-400'
          : isOver && isInvalidDrop
            ? 'bg-red-950/30 ring-2 ring-inset ring-red-500'
            : occupied
              ? 'bg-transparent'
              : 'border border-slate-800 bg-slate-950/50'
      }`}
    >
      {children}
    </div>
  )
}
