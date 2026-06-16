import type { ConveyorType } from '../../types/conveyor'

export type PaletteDragData = {
  source: 'palette'
  type: ConveyorType
}

export type GridDragData = {
  source: 'grid'
  unitId: string
}

export type BuilderDragData = PaletteDragData | GridDragData

export function cellId(gridX: number, gridY: number): string {
  return `cell-${gridX}-${gridY}`
}

export function parseCellId(id: string): { gridX: number; gridY: number } | null {
  const match = /^cell-(\d+)-(\d+)$/.exec(id)
  if (!match) return null
  return { gridX: Number(match[1]), gridY: Number(match[2]) }
}

export function paletteId(type: ConveyorType): string {
  return `palette-${type}`
}

export function unitDragId(unitId: string): string {
  return `unit-${unitId}`
}

export function parseUnitDragId(id: string): string | null {
  const match = /^unit-(.+)$/.exec(id)
  return match?.[1] ?? null
}
