export type InterfaceUnitType = 'OHT' | 'AGV' | 'ROBOT' | 'AMR' | 'EQ'

export type PortDirection = 'IN' | 'OUT'
export type PortRecipe = '2BP1ST' | '2BPCV'
export type PortLinkedUnit = 'OHT' | 'STK' | 'AGV'

export type StorageShape = 'flat' | 'vertical'
export type StorageRobotCount = '01' | '02'
export type StorageMaintenanceArea = 'HP' | 'OP' | 'ALL'

export type ConveyorType =
  | 'straight'
  | 'turn'
  | 'junction'
  | 'lift'
  | 'port'
  | 'storage'

/** @deprecated localStorage 마이그레이션용 */
export type LegacyConveyorType = ConveyorType | 'curve'

export type ConveyorStatus = 'idle' | 'running' | 'error' | 'maintenance'

export type Rotation = 0 | 90 | 180 | 270

export type HistoryEventType =
  | 'start'
  | 'stop'
  | 'error'
  | 'maintenance'
  | 'statusChange'
  | 'application'

export interface ConveyorUnit {
  id: string
  name: string
  gridX: number
  gridY: number
  type: ConveyorType
  rotation: Rotation
  connections: string[]
  status: ConveyorStatus
  interfaceUnit: InterfaceUnitType | null
  /** type === 'port' 일 때만 사용 */
  portDirection: PortDirection | null
  portRecipe: PortRecipe | null
  portLinkedUnit: PortLinkedUnit | null
  /** type === 'storage' 일 때만 사용 */
  storageShape: StorageShape | null
  storageRobotCount: StorageRobotCount | null
  storageMaintenanceArea: StorageMaintenanceArea | null
  createdAt: string
  updatedAt: string
}

export interface ConveyorLine {
  id: string
  name: string
  gridSize: { cols: number; rows: number }
  units: ConveyorUnit[]
  /** CV-01 순번 부여 시작점 유닛 ID */
  baseUnitId?: string | null
  createdAt: string
  updatedAt: string
}

export interface HistoryRecord {
  id: string
  unitId: string
  lineId: string
  eventType: HistoryEventType
  message: string
  logTitle?: string
  prevStatus?: string
  nextStatus?: string
  timestamp: string
  operator?: string
}

export interface HistoryFilter {
  lineId?: string
  unitId?: string
  eventType?: HistoryEventType
  from?: string
  to?: string
}

export interface AppSettings {
  lastViewedLineId?: string
  zoomLevel?: number
}
