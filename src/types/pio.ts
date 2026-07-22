/**
 * PIO (Parallel I/O) 핸드셰이크 — 반도체 물류 설비 간 인터페이스 신호 모델.
 *
 * 두 가지 프로토콜을 병행 지원한다:
 * - E84: SEMI E84 표준 — AMHS 차량(OHT/AGV)이 설비·포트에 도킹하는 정식 병렬 I/O
 *   핸드셰이크 (VALID/CS_0/TR_REQ/BUSY/COMPT + L_REQ/U_REQ/READY/HO_AVBL/ES, 최대 IN 8/OUT 8).
 * - STATUS: 컨베이어↔컨베이어, 컨베이어↔포트, 포트↔적재창고 — 이 앱이 실제로
 *   시뮬레이션하는 상태값(LD/ULD/BUSY/READY, IDLE/TR/COMPLETE)을 그대로 신호처럼
 *   기록한다. E84 신호(VALID·CS_0 등)를 쓰지 않는다 — 실제로 그런 신호가 없기 때문.
 */

/** 신호 소유 측 — active: 운반·상류 설비, passive: 수동·하류 설비 */
export type PioSide = 'active' | 'passive'

/** 핸드셰이크 쌍 유형 */
export type PioPairKind =
  | 'CNV_CNV' // 직선 컨베이어 ↔ 직선 컨베이어
  | 'CNV_TURN' // 컨베이어 ↔ 회전 컨베이어 (회전은 통과 시간이 달라 기준선 분리)
  | 'CNV_PORT' // 컨베이어 ↔ 포트
  | 'PORT_STK' // 포트 ↔ 적재창고
  | 'MODULE_OHT' // 모듈 ↔ OHT
  | 'MODULE_AGV' // 모듈 ↔ AGV

/** 신호 프로토콜 — 쌍 유형에 따라 자동 결정됨 (constants/pioSignals.ts의 pioProtocolForPair) */
export type PioProtocol = 'E84' | 'STATUS'

/**
 * 작업 방향 (Passive 설비 기준):
 * LOAD = Active가 Passive에 자재를 적재
 * UNLOAD = Active가 Passive에서 자재를 반출
 */
export type PioOperation = 'LOAD' | 'UNLOAD'

export type PioTransactionStatus = 'running' | 'complete' | 'error'

/** 신호 레벨 전환 (엣지) */
export interface PioEdge {
  /** 신호명 (E84: VALID·L_REQ 등 / STATUS: LD·ULD·BUSY·IDLE·TR·COMPLETE 등) */
  signal: string
  /** 신호 소유 측 — STATUS 프로토콜은 active/passive가 같은 신호명(BUSY 등)을 공유할 수 있어 구분 필요 */
  side: PioSide
  value: 0 | 1
  /** 트랜잭션 시작 기준 상대 시각 (ms) */
  t: number
}

/** 핸드셰이크 단계 ID — 측정·기준선 비교 단위. 프로토콜별 구체 ID는 constants/pioSignals.ts */
export type PioStepId = string

export interface PioStepDef {
  id: PioStepId
  label: string
  /** 코비 AI 원인 분석용 점검 포인트 */
  cause: string
}

/** 골든 베이스라인 — 단계별 기준 응답시간과 허용 편차 */
export interface PioBaseline {
  protocol: PioProtocol
  /** 측정 단계 순서 (표·차트에 이 순서로 표시) */
  stepOrder: PioStepId[]
  stepDefs: Record<PioStepId, PioStepDef>
  /** 단계별 기준 시간 (ms) */
  steps: Record<PioStepId, number>
  /** 기준 대비 +초과율(%) — 주의 */
  warnPct: number
  /** 기준 대비 +초과율(%) — 이상 */
  overPct: number
  /** 기준 출처 라벨 (예: '임의 설정', 'TX-abc123에서 캡처') */
  source: string
}

export type PioStepStatus = 'ok' | 'warn' | 'over' | 'missing'

/** 단계별 측정 결과 */
export interface PioStepMeasure {
  step: PioStepId
  label: string
  /** 측정 구간 시작/끝 (상대 ms) — missing이면 null */
  fromMs: number | null
  toMs: number | null
  durationMs: number | null
  baselineMs: number
  /** 측정 - 기준 (ms). 음수 = 기준보다 빠름 */
  deviationMs: number | null
  status: PioStepStatus
  cause: string
}

export type PioSource = 'sim-oht' | 'sim-port' | 'sim-path' | 'v3' | 'demo'

/** 하나의 핸드셰이크 = 트랜잭션 */
export interface PioTransaction {
  id: string
  pairKind: PioPairKind
  operation: PioOperation
  /** Active 설비명 (예: OHT-01, STK-01, CV12) */
  activeName: string
  /** Active 설비 모듈 타입 라벨 (예: 직선, 회전, 적재창고, OHT) — 차트 헤더 표시용 */
  activeType?: string
  /** Passive 설비명 (예: 30102, CV13) */
  passiveName: string
  /** Passive 설비 모듈 타입 라벨 (예: 포트, 직선, 회전) — 차트 헤더 표시용 */
  passiveType?: string
  startedAt: number // epoch ms
  endedAt: number | null
  status: PioTransactionStatus
  edges: PioEdge[]
  source: PioSource
  /** 오류 발생 단계 (status==='error'일 때) */
  errorStep?: PioStepId
}
