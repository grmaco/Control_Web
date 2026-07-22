/** Semi C/V V3 Web 관제시스템 WebSocket 프로토콜 (SemiCnv_MarkDown Web 섹션 기준) */

export type SemiCnvMessageType =
  | 'SITE_CONNECT'
  | 'CONVEYOR_STATUS'
  | 'LINE_STATUS'
  | 'ALARM_EVENT'
  | 'CST_TRACKING'
  | 'IO_STATUS'
  | 'LOG_EVENT'
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

/** 컨베이어·설비 개별 I/O 센서 (입구/출구 광센서, 스토퍼, POT/NOT 등) */
export interface SemiCnvSensorItem {
  name: string
  status: boolean
}

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
  alarmCode?: number
  alarmMessage?: string
  /** 이 컨베이어의 I/O 센서 상태 배열 — V3가 보낼 때만 존재 (V3 I/O 탭 표시용) */
  sensors?: SemiCnvSensorItem[]
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

/** IO_STATUS 메시지 — V3 Safety/Auto/Program 상세 데이터 */
export interface SemiCnvIOConditionItem {
  no: number
  name: string
  status: boolean
}

export interface SemiCnvProgramStatusItem {
  item: string
  value: string
}

export interface SemiCnvIOStatusData {
  safetyOk: boolean
  safetyConditions: SemiCnvIOConditionItem[]
  autoConditionOk: boolean
  autoConditions: SemiCnvIOConditionItem[]
  currentStatus: string
  programStatus: SemiCnvProgramStatusItem[]
}

/** 스토어에 저장되는 IO 상태 */
export interface SemiCnvIOStatus {
  safetyOk: boolean
  safetyConditions: SemiCnvIOConditionItem[]
  autoConditionOk: boolean
  autoConditions: SemiCnvIOConditionItem[]
  currentStatus: string
  programStatus: SemiCnvProgramStatusItem[]
  updatedAt: string
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
  power: SemiCnvPower
  cstId: string | null
  destination: number
  alarm: boolean
  alarmCode?: number | null
  alarmMessage?: string | null
  /** 회전/리프트 HOME 완료 여부 (V3 axis.homeDone) */
  homeDone: string | null
  /** 회전 유닛 현재 각도 (V3 currentDegree) */
  currentDegree: string | null
  /** 이 컨베이어의 I/O 센서 상태 — V3가 보낼 때만 존재 (V3 I/O 탭 표시용) */
  sensors?: SemiCnvSensorItem[]
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

/** LOG_EVENT 메시지 — V3 로그 실시간 스트리밍 */
export interface SemiCnvLogEventData {
  logTime: string       // 로컬 시각 ISO8601
  logType: string       // Application / Conveyor 1 / Master / ...
  logLevel: string      // Normal / Warning / Error
  title: string
  description: string
}

/** 스토어에 저장되는 V3 로그 엔트리 */
export interface SemiCnvLogEntry {
  id: string            // 중복 방지용 고유 키
  logTime: string
  logType: string
  logLevel: string
  title: string
  description: string
  receivedAt: string
  /** V3 현장(site) — 라인별 이력 필터용 */
  siteId?: string
}

/** CST 반송 여정 — CST_TRACKING/CONVEYOR_STATUS에서 집계 (localStorage 미저장) */
export interface SemiCnvCstJourney {
  cstId: string
  /** V3 현장(Site) ID — 라인별 표시 스코핑용. 구버전 보존 데이터는 없을 수 있음 */
  siteId?: string | null
  /** V3 라인 ID */
  lineId: number
  /** 목적지 Conveyor.ID (0 = 미지정) */
  destination: number
  /** 최초 관측(투입) 시각 */
  startAt: string
  /** 투입점 Conveyor.ID */
  entryConveyorId: number
  /** 위치 변경 이력 (최초 위치 포함) */
  hops: { conveyorId: number; at: string }[]
  /** 목적지 도착 시각 (미도착 null) */
  arrivedAt: string | null
  /** 목적지 반출 시각 (대기 중/반송 중 null) */
  departedAt: string | null
  lastSeenAt: string
  /** moving: 반송 중 · waiting: 목적지 대기 · done: 반출 완료 */
  status: 'moving' | 'waiting' | 'done'
  /**
   * true = Web 접속 시점에 이미 목적지에 있던 CST — 실제 투입·도착 시각을 알 수 없어
   * startAt/arrivedAt은 "최초 관측 시각"(하한값)일 뿐이다. UI는 투입/반송 소요를 표시하지 않는다.
   */
  incomplete?: boolean
  /**
   * true = 정상 반출 신호(목적지에서 다른/빈 cstId 관측) 없이, V3가 이 CST를 더 이상
   * 어디에서도 보고하지 않아 타임아웃으로 강제 종료됨 — 수동 반출·핸드셰이크 누락 등
   * 실제 위치는 알 수 없음. UI는 "완료"가 아닌 "유실"로 구분 표시한다.
   */
  lost?: boolean
}

/** V3 송수신 원본 트래픽 엔트리 — V3 데이터 조회 화면용 (localStorage 미저장) */
export interface SemiCnvTrafficEntry {
  id: string
  /** rx: V3 → Web 수신 / tx: Web → V3 송신 */
  direction: 'rx' | 'tx'
  /** 메시지 타입 (COMMAND 포함) */
  type: string
  siteId: string | null
  /** 메시지 자체 타임스탬프 (없으면 수신 시각) */
  timestamp: string
  /** 로컬 캡처 시각 */
  capturedAt: string
  /** 원본 JSON 전체 */
  payload: unknown
}

export type SemiCnvMessage =
  | SemiCnvEnvelope<SemiCnvSiteConnectData>
  | SemiCnvEnvelope<SemiCnvConveyorStatusItem[]>
  | SemiCnvEnvelope<SemiCnvLineStatusItem[]>
  | SemiCnvEnvelope<SemiCnvAlarmEventData>
  | SemiCnvEnvelope<SemiCnvCstTrackingItem[]>
  | SemiCnvEnvelope<SemiCnvIOStatusData>
  | SemiCnvEnvelope<SemiCnvLogEventData>
  | SemiCnvEnvelope<SemiCnvHeartbeatData>
