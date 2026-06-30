/** 유닛 역할 — 물류 라인 내 기능 구분 */
export type UnitRole =
  | 'INPUT'
  | 'OUTPUT'
  | 'TRANSFER'
  | 'STORAGE'
  | 'PORT_IN'
  | 'PORT_OUT'

/** @deprecated STK 분기 라우팅 제거 — 하위 호환 마이그레이션용 */
export interface StkRoutingProperties {
  enabled: boolean
  priority: number
  targetStkPolicy: string
  allowedStkIds: string[]
  description?: string
}

/** @deprecated transitLinkedUnits.linkedUnitIds 사용 — 하위 호환 마이그레이션용 */
export interface JunctionRoutingProperties {
  /** @deprecated requestUnitIds 사용 — 하위 호환 */
  requestUnitId?: string
  /** @deprecated transitLinkedUnits.linkedUnitIds 사용 */
  requestUnitIds: string[]
  description?: string
}

/** 분기·회전 유닛 — 인접 연동 컨베이어 (투입 목적지·시뮬 연동) */
export interface TransitLinkedUnitsProperties {
  linkedUnitIds: string[]
}

/** 포트 — STK 투입고·출고구 공통 속성 */
export interface PortProperties {
  enabled: boolean
  /** LOAD UNIT(IN) / UNLOAD UNIT(OUT) — 인접 컨베이어 유닛 ID */
  linkedUnitId: string
  /** 출고구(OUT) — 컨베이어 라인 목적지 CV */
  outputDestination?: string
  description?: string
}

/** @deprecated PortProperties.linkedUnitId 사용 */
export type OutputPortProperties = PortProperties

/** 스토커(STORAGE) 전용 속성 */
export interface StkProperties {
  capacity: number
  currentLoad: number
  stkOrder: number
  enabled: boolean
  inputSources: string[]
  outputPorts: string[]
  description?: string
}

/** @deprecated STK 라우팅 제거 — 하위 호환용 */
export type InputPortProperties = StkRoutingProperties

export type UnitRoleProperties = StkProperties | PortProperties

export type PathSimulationDirection = 'inbound' | 'outbound'

/** 모니터 — 투입/출고 경로 계획 */
export interface PathSimulationPlan {
  entryUnitId: string
  routingUnitId: string | null
  targetStkId: string | null
  targetExitId?: string | null
  pathUnitIds: string[]
  /** 시작 전·경로 미리보기 — 직선·분기·회전 탐색 순서 */
  previewPathUnitIds?: string[]
  message: string
  direction?: PathSimulationDirection
}

/** 모니터 — 자재 1개(투입점·출고포트별) 시뮬레이션 상태 */
export interface PathSimulationLoad {
  id: string
  entryUnitId: string
  label: string
  direction: PathSimulationDirection
  routingUnitId: string | null
  targetStkId: string | null
  targetExitId: string | null
  pathUnitIds: string[]
  /** 경로 미리보기 — 직선·분기·회전 전체 탐색 후 목적지 확정 */
  previewPathUnitIds?: string[]
  stepIndex: number
  complete: boolean
  /** 이번 틱에 충돌로 대기 중 */
  waiting: boolean
  message: string
  /** 완료 시 해당 출발 모듈의 테스트 자재(testMaterial) 제거 */
  clearsTestMaterial?: boolean
  /** 시뮬 시작 시 true — 동시 출발 */
  released?: boolean
  /** 다중 투입 시 순차 출발까지 남은 틱 */
  pendingReleaseTicks?: number
  /** 출발 모듈(step 0) 체류 틱 — 투입 시간 반영 */
  entryTicks?: number
  /** 종료 모듈 체류 틱 — 출고 시간 반영 */
  exitTicks?: number
  /** 현재 모듈 체류 틱 — 다음 모듈 이송 전 대기 */
  transitTicks?: number
  /** 연속 투입으로 생성된 자재 */
  continuousInject?: boolean
  /** 우회 불가 — 현재 위치에서 목적지까지 도달 경로 없음 (갈 곳 없음) */
  noRoute?: boolean
}

/** 모니터 — 다중 투입점 동시 시뮬레이션 계획 */
export interface MultiPathSimulationPlan {
  loads: PathSimulationLoad[]
  message: string
}

export const PATH_SIMULATION_STEP_MS = 250
/** 기본 투입(시작점) 체류 (초) */
export const DEFAULT_SIM_INPUT_INTERVAL_SEC = 0.5
/** 기본 출고(종료점) 체류 (초) */
export const DEFAULT_SIM_DISCHARGE_INTERVAL_SEC = 0.5
/** 기본 모듈 간 이송 (초) — 다음 모듈로 이동 전 대기 */
export const DEFAULT_SIM_TRANSIT_INTERVAL_SEC = 0.5
/** 시작 시 출발→목적지 순차 점등 간격 */
export const PATH_REVEAL_STEP_MS = 120
/** 다중 투입점 — 경로 미리보기 전환 시 꺼짐 간격 */
export const PATH_REVEAL_GAP_MS = 400
/** 목적지 도달 후 네온 유지 시간 (시작 점등) */
export const PATH_REVEAL_FINAL_HOLD_MS = 500
/** 종료점 도착 후 CST On 유지 시간 */
export const PATH_SIMULATION_END_HOLD_MS = 500
