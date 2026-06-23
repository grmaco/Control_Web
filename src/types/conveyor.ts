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

/** 테스트용 — 미니맵 CST(자재) 표시 (0: 없음, 1: 있음) */
export type TestMaterialFlag = 0 | 1

export type HistoryEventType =
  | 'start'
  | 'stop'
  | 'error'
  | 'maintenance'
  | 'statusChange'
  | 'application'

export type FlowRole = 'entry' | 'exit'

import type {
  StkRoutingProperties,
  UnitRole,
  UnitRoleProperties,
} from './unitProperties'

export type { UnitRole, StkPolicy, StkRoutingProperties, StkProperties, PortProperties, OutputPortProperties, UnitRoleProperties, RoutingSimulationResult } from './unitProperties'

export interface ConveyorUnit {
  id: string
  /** 사용자 지정 코드 (예: CV01) — 미설정 시 name과 동일 */
  code?: string
  name: string
  /** Semi C/V 프로그램 Conveyor.ID — WebSocket 매핑용 */
  semiCnvId?: number
  gridX: number
  gridY: number
  type: ConveyorType
  rotation: Rotation
  connections: string[]
  status: ConveyorStatus
  interfaceUnit: InterfaceUnitType | null
  /** 물류 역할 (투입구·스토커·출고 포트 등) */
  role?: UnitRole | null
  /** 역할별 상세 속성 — STORAGE, PORT_OUT */
  properties?: UnitRoleProperties | null
  /** type === 'turn' | 'junction' — STK 분기 라우팅 */
  stkRouting?: StkRoutingProperties | null
  /** 물류 시작(투입) / 종료(출고) — 분기 라인에서 복수 지정 */
  flowRole?: FlowRole | null
  /** type === 'port' 일 때만 사용 */
  portDirection: PortDirection | null
  portRecipe: PortRecipe | null
  portLinkedUnit: PortLinkedUnit | null
  /** type === 'storage' 일 때만 사용 */
  storageShape: StorageShape | null
  storageRobotCount: StorageRobotCount | null
  storageMaintenanceArea: StorageMaintenanceArea | null
  /** 테스트용 — HOME 미니맵 자재(CST) 네온 표시 */
  testMaterial: TestMaterialFlag
  createdAt: string
  updatedAt: string
}

export interface ConveyorLine {
  id: string
  name: string
  /** Semi C/V Line ID — WebSocket LINE_STATUS 매핑용 */
  semiCnvLineId?: number
  /** Semi C/V 현장(Site) ID — 다중 Fab 구분용 */
  semiCnvSiteId?: string
  gridSize: { cols: number; rows: number }
  units: ConveyorUnit[]
  /** @deprecated flowRole=entry 사용 — 로드 시 자동 마이그레이션 */
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

import type { SemiCnvMonitorSettings } from './semicnv'

export interface AppSettings {
  lastViewedLineId?: string
  zoomLevel?: number
  /** Semi C/V WebSocket 모니터링 연동 설정 */
  semiCnv?: SemiCnvMonitorSettings
}
