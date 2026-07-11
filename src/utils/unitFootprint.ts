import { WAREHOUSE_FOOTPRINT_SIZE } from '../constants/warehouseUnit'
import { isStorage, isStorageUnit } from '../constants/conveyorTypes'
import type { ConveyorType, ConveyorUnit } from '../types/conveyor'

export interface UnitFootprint {
  cols: number
  rows: number
}

export interface GridCellCoord {
  gridX: number
  gridY: number
}

/** 적재창고 가로 칸 수 — 최소·기본 3 (세로는 항상 3 고정) */
export function storageWidthOf(unit: ConveyorUnit): number {
  return Math.max(WAREHOUSE_FOOTPRINT_SIZE, unit.storageWidthCells ?? WAREHOUSE_FOOTPRINT_SIZE)
}

export function getUnitFootprint(unitOrType: ConveyorUnit | ConveyorType): UnitFootprint {
  const isUnit = typeof unitOrType !== 'string'
  const type = isUnit ? unitOrType.type : unitOrType
  if (isStorage(type)) {
    const width = isUnit ? storageWidthOf(unitOrType) : WAREHOUSE_FOOTPRINT_SIZE
    const rotation = isUnit ? unitOrType.rotation : 0
    // 90°/270° 회전 시 가로·세로가 뒤바뀜 — 세로(깊이)는 항상 WAREHOUSE_FOOTPRINT_SIZE 고정
    const rotated = rotation === 90 || rotation === 270
    return rotated
      ? { cols: WAREHOUSE_FOOTPRINT_SIZE, rows: width }
      : { cols: width, rows: WAREHOUSE_FOOTPRINT_SIZE }
  }
  return { cols: 1, rows: 1 }
}

export function getFootprintCells(
  anchorX: number,
  anchorY: number,
  footprint: UnitFootprint,
): GridCellCoord[] {
  const cells: GridCellCoord[] = []
  for (let dy = 0; dy < footprint.rows; dy += 1) {
    for (let dx = 0; dx < footprint.cols; dx += 1) {
      cells.push({ gridX: anchorX + dx, gridY: anchorY + dy })
    }
  }
  return cells
}

export function isUnitAnchor(unit: ConveyorUnit, gridX: number, gridY: number): boolean {
  return unit.gridX === gridX && unit.gridY === gridY
}

export function unitOccupiesCell(unit: ConveyorUnit, gridX: number, gridY: number): boolean {
  const footprint = getUnitFootprint(unit)
  return (
    gridX >= unit.gridX &&
    gridX < unit.gridX + footprint.cols &&
    gridY >= unit.gridY &&
    gridY < unit.gridY + footprint.rows
  )
}

export function findUnitAtCell(
  units: ConveyorUnit[],
  gridX: number,
  gridY: number,
): ConveyorUnit | undefined {
  return units.find((unit) => unitOccupiesCell(unit, gridX, gridY))
}

export function isFootprintAvailable(
  units: ConveyorUnit[],
  anchorX: number,
  anchorY: number,
  footprint: UnitFootprint,
  gridCols: number,
  gridRows: number,
  excludeUnitId?: string,
): boolean {
  if (
    anchorX < 0 ||
    anchorY < 0 ||
    anchorX + footprint.cols > gridCols ||
    anchorY + footprint.rows > gridRows
  ) {
    return false
  }

  return getFootprintCells(anchorX, anchorY, footprint).every((cell) => {
    const occupant = findUnitAtCell(units, cell.gridX, cell.gridY)
    if (!occupant) return true
    return excludeUnitId !== undefined && occupant.id === excludeUnitId
  })
}

/** 다칸 유닛 — 내부 격자선 없이 외곽 테두리만 */
export function footprintBorderClasses(
  unit: ConveyorUnit,
  gridX: number,
  gridY: number,
): string {
  // STK는 앵커 셀의 단일 외곽 프레임으로만 테두리를 그린다.
  if (isStorageUnit(unit)) return ''

  const footprint = getUnitFootprint(unit)
  if (footprint.cols === 1 && footprint.rows === 1) return 'border-[0.5px]'

  const localX = gridX - unit.gridX
  const localY = gridY - unit.gridY
  const classes: string[] = []

  if (localY === 0) classes.push('border-t-[0.5px]')
  if (localY === footprint.rows - 1) classes.push('border-b-[0.5px]')
  if (localX === 0) classes.push('border-l-[0.5px]')
  if (localX === footprint.cols - 1) classes.push('border-r-[0.5px]')

  // 내부 셀은 테두리를 비워 STK 내부 분할선을 숨긴다.
  return classes.length > 0 ? classes.join(' ') : ''
}
