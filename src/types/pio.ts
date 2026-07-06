/**
 * PIO (Parallel I/O) 핸드셰이크 — SEMI E84 기반 신호 모델.
 *
 * 반도체 물류(OHT·Stocker·Conveyor)에서 자재 이송의 시작과 끝을 결정하는
 * Active(운반 측) ↔ Passive(수동 측) 병렬 I/O 인터페이스를 기록·시각화한다.
 * 최대 IN 8점 / OUT 8점.
 */

/** 신호 소유 측 — active: 운반 설비(OHT/STK/상류 CV), passive: 수동 설비(포트/모듈/하류 CV) */
export type PioSide = 'active' | 'passive'

/** 핸드셰이크 쌍 유형 */
export type PioPairKind =
  | 'CNV_CNV' // 컨베이어 ↔ 컨베이어
  | 'CNV_PORT' // 컨베이어 ↔ 포트
  | 'PORT_STK' // 포트 ↔ 적재창고
  | 'MODULE_OHT' // 모듈 ↔ OHT
  | 'MODULE_AGV' // 모듈 ↔ AGV

/**
 * 작업 방향 (Passive 설비 기준):
 * LOAD = Active가 Passive에 자재를 적재 (L_REQ 사용)
 * UNLOAD = Active가 Passive에서 자재를 반출 (U_REQ 사용)
 */
export type PioOperation = 'LOAD' | 'UNLOAD'

export type PioTransactionStatus = 'running' | 'complete' | 'error'

/** 신호 레벨 전환 (엣지) */
export interface PioEdge {
  /** 신호명 (예: VALID, L_REQ) */
  signal: string
  value: 0 | 1
  /** 트랜잭션 시작 기준 상대 시각 (ms) */
  t: number
}

/** 핸드셰이크 단계 ID — 측정·기준선 비교 단위 */
export type PioStepId =
  | 'T1_VALID_REQ' // VALID↑ → REQ↑ (Passive 응답)
  | 'T2_REQ_TRREQ' // REQ↑ → TR_REQ↑ (Active 이송 요청)
  | 'T3_TRREQ_READY' // TR_REQ↑ → READY↑ (Passive 준비 완료)
  | 'T4_READY_BUSY' // READY↑ → BUSY↑ (이송 개시)
  | 'T5_BUSY_CARRIER' // BUSY↑ → REQ↓ (자재 전달 — 최장 구간)
  | 'T6_CARRIER_COMPT' // REQ↓ → COMPT↑ (이송 정리)
  | 'T7_COMPT_CLOSE' // COMPT↑ → VALID↓ (핸드셰이크 종료)

/** 골든 베이스라인 — 단계별 기준 응답시간과 허용 편차 */
export interface PioBaseline {
  /** 단계별 기준 시간 (ms) */
  steps: Record<PioStepId, number>
  /** 기준 대비 +초과율(%) — 주의 */
  warnPct: number
  /** 기준 대비 +초과율(%) — 이상 */
  overPct: number
  /** 기준 출처 라벨 (예: '기본값', 'TX-abc123에서 캡처') */
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
}

export type PioSource = 'sim-oht' | 'sim-port' | 'sim-path' | 'v3' | 'demo'

/** 하나의 핸드셰이크 = 트랜잭션 */
export interface PioTransaction {
  id: string
  pairKind: PioPairKind
  operation: PioOperation
  /** Active 설비명 (예: OHT-01, STK-01, CV12) */
  activeName: string
  /** Passive 설비명 (예: 30102, CV13) */
  passiveName: string
  startedAt: number // epoch ms
  endedAt: number | null
  status: PioTransactionStatus
  edges: PioEdge[]
  source: PioSource
  /** 오류 발생 단계 (status==='error'일 때) */
  errorStep?: PioStepId
}
