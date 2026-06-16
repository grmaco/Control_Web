export type InterfaceUnitType = 'OHT' | 'AGV' | 'ROBOT' | 'AMR' | 'EQ'

export type ConveyorType = 'straight' | 'turn' | 'junction' | 'lift'

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
