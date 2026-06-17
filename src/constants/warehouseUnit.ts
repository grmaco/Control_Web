import type {
  StorageMaintenanceArea,
  StorageRobotCount,
  StorageShape,
} from '../types/conveyor'

export const WAREHOUSE_FOOTPRINT_SIZE = 3

export const WAREHOUSE_SHAPES: StorageShape[] = ['flat', 'vertical']

export const WAREHOUSE_ROBOT_COUNTS: StorageRobotCount[] = ['01', '02']

export const WAREHOUSE_MAINTENANCE_AREAS: StorageMaintenanceArea[] = ['HP', 'OP', 'ALL']

export const DEFAULT_WAREHOUSE_SHAPE: StorageShape = 'flat'
export const DEFAULT_WAREHOUSE_ROBOT_COUNT: StorageRobotCount = '01'
export const DEFAULT_WAREHOUSE_MAINTENANCE_AREA: StorageMaintenanceArea = 'ALL'

export function warehouseShapeLabel(shape: StorageShape): string {
  return shape === 'flat' ? '평상형' : '수직형'
}

export function warehouseMaintenanceAreaLabel(area: StorageMaintenanceArea): string {
  return area
}

/** @deprecated use WAREHOUSE_* names */
export const STORAGE_FOOTPRINT_SIZE = WAREHOUSE_FOOTPRINT_SIZE
export const STORAGE_SHAPES = WAREHOUSE_SHAPES
export const STORAGE_ROBOT_COUNTS = WAREHOUSE_ROBOT_COUNTS
export const STORAGE_MAINTENANCE_AREAS = WAREHOUSE_MAINTENANCE_AREAS
export const DEFAULT_STORAGE_SHAPE = DEFAULT_WAREHOUSE_SHAPE
export const DEFAULT_STORAGE_ROBOT_COUNT = DEFAULT_WAREHOUSE_ROBOT_COUNT
export const DEFAULT_STORAGE_MAINTENANCE_AREA = DEFAULT_WAREHOUSE_MAINTENANCE_AREA
export const storageShapeLabel = warehouseShapeLabel
export const storageMaintenanceAreaLabel = warehouseMaintenanceAreaLabel
