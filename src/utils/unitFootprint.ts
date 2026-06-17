import { WAREHOUSE_FOOTPRINT_SIZE } from '../constants/warehouseUnit'
import { isStorage } from '../constants/conveyorTypes'
import type { ConveyorType, ConveyorUnit } from '../types/conveyor'

export interface UnitFootprint {
  cols: number
  rows: number
}

export interface GridCellCoord {
  gridX: number
  gridY: number
}

export function getUnitFootprint(unitOrType: ConveyorUnit | ConveyorType): UnitFootprint {
  const type = typeof unitOrType === 'string' ? unitOrType : unitOrType.type
  if (isStorage(type)) {
    return { cols: WAREHOUSE_FOOTPRINT_SIZE, rows: WAREHOUSE_FOOTPRINT_SIZE }
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
