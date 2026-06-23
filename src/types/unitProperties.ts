/** 유닛 역할 — 물류 라인 내 기능 구분 */
export type UnitRole =
  | 'INPUT'
  | 'OUTPUT'
  | 'TRANSFER'
  | 'STORAGE'
  | 'PORT_IN'
  | 'PORT_OUT'

/** STK 라우팅 정책 (회전·분기 유닛) */
export type StkPolicy =
  | 'MANUAL_ORDER'
  | 'LOAD_RATE_FIRST'
  | 'LOAD_RATE_LAST'
  | 'ROUND_ROBIN'

/** 회전/분기 유닛 — 어느 STK로 보낼지 결정 */
export interface StkRoutingProperties {
  enabled: boolean
  priority: number
  targetStkPolicy: StkPolicy
  allowedStkIds: string[]
  description?: string
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

/** @deprecated STK 라우팅은 turn/junction stkRouting 사용 */
export type InputPortProperties = StkRoutingProperties

export type UnitRoleProperties = StkProperties | PortProperties

export interface RoutingSimulationResult {
  sourceUnitId: string
  targetStkId: string | null
  pathUnitIds: string[]
  message: string
}

export type PathSimulationDirection = 'inbound' | 'outbound'

/** 모니터 — 투입/출고 경로 계획 */
export interface PathSimulationPlan {
  entryUnitId: string
  routingUnitId: string | null
  targetStkId: string | null
  targetExitId?: string | null
  pathUnitIds: string[]
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
  stepIndex: number
  complete: boolean
  /** 이번 틱에 충돌로 대기 중 */
  waiting: boolean
  message: string
}

/** 모니터 — 다중 투입점 동시 시뮬레이션 계획 */
export interface MultiPathSimulationPlan {
  loads: PathSimulationLoad[]
  message: string
}

export const PATH_SIMULATION_STEP_MS = 500
