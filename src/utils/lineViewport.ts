import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import {
  BUILDER_DEFAULT_VIEWPORT_COLS,
  BUILDER_DEFAULT_VIEWPORT_ROWS,
  BUILDER_VIEWPORT_PADDING,
} from '../constants/grid'

export interface LineViewport {
  minX: number
  minY: number
  maxX: number
  maxY: number
  cols: number
  rows: number
}

function clampViewportToGrid(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  gridCols: number,
  gridRows: number,
): LineViewport {
  const clampedMinX = Math.max(0, minX)
  const clampedMinY = Math.max(0, minY)
  const clampedMaxX = Math.min(gridCols - 1, maxX)
  const clampedMaxY = Math.min(gridRows - 1, maxY)

  return {
    minX: clampedMinX,
    minY: clampedMinY,
    maxX: clampedMaxX,
    maxY: clampedMaxY,
    cols: clampedMaxX - clampedMinX + 1,
    rows: clampedMaxY - clampedMinY + 1,
  }
}

/** 라인 빌더용 — (0,0) 고정, 유닛 배치에 따라 우·아래로만 확장 */
export function getBuilderViewport(
  line: ConveyorLine,
  padding = BUILDER_VIEWPORT_PADDING,
): LineViewport {
  const { cols: gridCols, rows: gridRows } = line.gridSize

  let maxX = BUILDER_DEFAULT_VIEWPORT_COLS - 1
  let maxY = BUILDER_DEFAULT_VIEWPORT_ROWS - 1

  if (line.units.length > 0) {
    const bounds = getLineViewport(line, 0)!
    maxX = Math.max(maxX, bounds.maxX + padding)
    maxY = Math.max(maxY, bounds.maxY + padding)
  }

  return clampViewportToGrid(0, 0, maxX, maxY, gridCols, gridRows)
}

export function getLineViewport(
  line: ConveyorLine,
  padding = 1,
): LineViewport | null {
  if (line.units.length === 0) return null

  const minX = Math.min(...line.units.map((u) => u.gridX))
  const maxX = Math.max(...line.units.map((u) => u.gridX))
  const minY = Math.min(...line.units.map((u) => u.gridY))
  const maxY = Math.max(...line.units.map((u) => u.gridY))

  const paddedMinX = Math.max(0, minX - padding)
  const paddedMinY = Math.max(0, minY - padding)
  const paddedMaxX = Math.min(line.gridSize.cols - 1, maxX + padding)
  const paddedMaxY = Math.min(line.gridSize.rows - 1, maxY + padding)

  return {
    minX: paddedMinX,
    minY: paddedMinY,
    maxX: paddedMaxX,
    maxY: paddedMaxY,
    cols: paddedMaxX - paddedMinX + 1,
    rows: paddedMaxY - paddedMinY + 1,
  }
}

export function findUnitAt(
  units: ConveyorUnit[],
  gridX: number,
  gridY: number,
): ConveyorUnit | undefined {
  return units.find((u) => u.gridX === gridX && u.gridY === gridY)
}

export function fitCellSize(
  viewport: LineViewport,
  containerWidth: number,
  containerHeight: number,
  minCell = 4,
): number {
  if (containerWidth <= 0 || containerHeight <= 0) return minCell
  const byWidth = containerWidth / viewport.cols
  const byHeight = containerHeight / viewport.rows
  return Math.max(minCell, Math.floor(Math.min(byWidth, byHeight)))
}
