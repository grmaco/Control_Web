import type { ConveyorType } from '../../types/conveyor'
import type { OhtRailType } from '../../types/oht'

export type PaletteDragData = {
  source: 'palette'
  type: ConveyorType
}

export type GridDragData = {
  source: 'grid'
  unitId: string
}

/** OHT 팔레트에서 레일/유닛을 드래그 */
export type OhtPaletteDragData = {
  source: 'oht-palette'
  /** railType 지정 시 레일, 'unit' 지정 시 OHT 대차 */
  kind: 'rail' | 'unit'
  railType?: OhtRailType
}

/** 그리드에 배치된 OHT 레일/유닛을 드래그 */
export type OhtGridDragData = {
  source: 'oht-grid'
  kind: 'rail' | 'unit'
  ohtId: string
}

export type BuilderDragData =
  | PaletteDragData
  | GridDragData
  | OhtPaletteDragData
  | OhtGridDragData

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

export function ohtPaletteId(kind: 'rail' | 'unit', railType?: string): string {
  return kind === 'rail' ? `oht-palette-rail-${railType}` : 'oht-palette-unit'
}

export function ohtGridDragId(kind: 'rail' | 'unit', ohtId: string): string {
  return `oht-grid-${kind}-${ohtId}`
}
