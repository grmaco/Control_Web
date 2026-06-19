/** Semi C/V V3 Web 관제시스템 WebSocket 프로토콜 (SemiCnv_MarkDown Web 섹션 기준) */

export type SemiCnvMessageType =
  | 'SITE_CONNECT'
  | 'CONVEYOR_STATUS'
  | 'LINE_STATUS'
  | 'ALARM_EVENT'
  | 'CST_TRACKING'
  | 'HEARTBEAT'
  | 'COMMAND'

export interface SemiCnvEnvelope<T = unknown> {
  type: SemiCnvMessageType
  siteId: string
  timestamp: string
  data: T
}

export type SemiCnvConveyorType =
  | 'None'
  | 'Normal'
  | 'Turn'
  | 'LFT'
  | 'ZT'
  | 'RX'
  | 'Up_Down'

export type SemiCnvControlMode = 'MasterMode' | 'CIMMode'
export type SemiCnvRunStatus = 'Run' | 'Stop'
export type SemiCnvOperationStatus = 'Manual' | 'Auto'
export type SemiCnvAutoStatus = 'None' | 'Idle' | 'Load' | 'Busy' | 'Unload' | 'Compt'
export type SemiCnvPower = 'On' | 'Off'
export type SemiCnvSafetyStatus = 'OK' | 'NG'
export type SemiCnvKeyStatus = 'Manual' | 'Auto'
export type SemiCnvAutoCondition = 'Possible' | 'Impossible'
export type SemiCnvAlarmEventType = 'OCCUR' | 'CLEAR'
export type SemiCnvAlarmLevel = 'Error' | 'Warning' | 'Info'

export interface SemiCnvConveyorStatusItem {
  id: number
  lineId: number
  name: string
  conveyorType: SemiCnvConveyorType
  controlMode: SemiCnvControlMode
  runStatus: SemiCnvRunStatus
  operationStatus: SemiCnvOperationStatus
  autoStatus: SemiCnvAutoStatus
  autoStep: number
  power: SemiCnvPower
  alarm: boolean
  cstId: string | null
  destination: number
  currentDegree?: string
  axis?: { torque: number; homeDone: string }
}

export interface SemiCnvLineStatusItem {
  lineId: number
  lineName: string
  safetyStatus: SemiCnvSafetyStatus
  keyStatus: SemiCnvKeyStatus
  autoCondition: SemiCnvAutoCondition
  operationStatus: SemiCnvOperationStatus
  controlMode: SemiCnvControlMode
  totalConveyors: number
  runningConveyors: number
  alarmConveyors: number
}

export interface SemiCnvSiteConnectData {
  siteName: string
  programVersion: string
  apiKey?: string
  lineCount: number
  conveyorCount: number
}

export interface SemiCnvAlarmEventData {
  eventType: SemiCnvAlarmEventType
  conveyorId: number
  lineId: number
  alarmCode: string
  alarmLevel: SemiCnvAlarmLevel
  alarmStep: number
  message: string
}

export interface SemiCnvCstTrackingItem {
  cstId: string
  conveyorId: number
  lineId: number
  destination: number
}

export interface SemiCnvHeartbeatData {
  status: 'ALIVE'
}

/** Web 대시보드 설정 (AppSettings.semiCnv) */
export interface SemiCnvMonitorSettings {
  /** WebSocket 연동 활성화 */
  enabled: boolean
  /** 대시보드 WebSocket URL (예: ws://host/ws/dashboard) */
  wsUrl: string
  /** 수신 대상 현장 ID (비우면 모든 Site 수신) */
  siteId?: string
  /** 클라이언트 내장 Mock 피드 (개발용) */
  mockMode?: boolean
}

export type SemiCnvConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

/** 라인(현장)별 통신 상태 */
export type SemiCnvCommState =
  | 'local'
  | 'waiting'
  | 'online'
  | 'offline'
  | 'unmapped'

export interface SemiCnvSiteStatus {
  siteId: string
  siteName: string | null
  programVersion: string | null
  online: boolean
  lastMessageAt: string
  lastHeartbeatAt: string | null
}

export interface SemiCnvLineCommRecord {
  siteId: string
  lastMessageAt: string
}

export interface SemiCnvLineCommStatus {
  lineId: string
  siteId: string | null
  siteName: string | null
  state: SemiCnvCommState
  lastMessageAt: string | null
  /** 마지막 수신 후 경과 초 (표시용) */
  staleSeconds: number | null
}

/** 유닛별 실시간 런타임 오버레이 (localStorage 미저장) */
export interface SemiCnvUnitRuntime {
  semiCnvId: number
  semiCnvLineId: number
  autoStep: number
  autoStatus: SemiCnvAutoStatus
  runStatus: SemiCnvRunStatus
  operationStatus: SemiCnvOperationStatus
  cstId: string | null
  destination: number
  alarm: boolean
  updatedAt: string
}

export interface SemiCnvLineRuntime {
  semiCnvLineId: number
  lineName: string
  safetyStatus: SemiCnvSafetyStatus
  keyStatus: SemiCnvKeyStatus
  autoCondition: SemiCnvAutoCondition
  operationStatus: SemiCnvOperationStatus
  runningConveyors: number
  alarmConveyors: number
  updatedAt: string
}

export type SemiCnvMessage =
  | SemiCnvEnvelope<SemiCnvSiteConnectData>
  | SemiCnvEnvelope<SemiCnvConveyorStatusItem[]>
  | SemiCnvEnvelope<SemiCnvLineStatusItem[]>
  | SemiCnvEnvelope<SemiCnvAlarmEventData>
  | SemiCnvEnvelope<SemiCnvCstTrackingItem[]>
  | SemiCnvEnvelope<SemiCnvHeartbeatData>
