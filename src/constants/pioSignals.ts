import type {
  PioBaseline,
  PioEdge,
  PioOperation,
  PioPairKind,
  PioSide,
  PioStepId,
} from '../types/pio'

export const PIO_PAIR_LABELS: Record<PioPairKind, string> = {
  CNV_CNV: 'CV↔CV',
  CNV_PORT: 'CV↔PORT',
  PORT_STK: 'PORT↔STK',
  MODULE_OHT: 'MODULE↔OHT',
  MODULE_AGV: 'MODULE↔AGV',
}

/** 신호 정의 — SEMI E84 병렬 I/O (Active OUT 8점 / Passive IN 8점) */
export interface PioSignalDef {
  name: string
  side: PioSide
  /** 트랜잭션 시작 시 초기 레벨 */
  initial: 0 | 1
  /** 예비 신호 — 차트에서 접어서 표시 */
  reserved?: boolean
  description: string
}

/** Active(운반 설비) → Passive 방향 출력 8점 */
export const PIO_ACTIVE_SIGNALS: PioSignalDef[] = [
  { name: 'VALID', side: 'active', initial: 0, description: '핸드셰이크 유효 (시작 신호)' },
  { name: 'CS_0', side: 'active', initial: 0, description: '캐리어 스테이지 0 선택' },
  { name: 'CS_1', side: 'active', initial: 0, reserved: true, description: '캐리어 스테이지 1 선택 (예비)' },
  { name: 'AM_AVBL', side: 'active', initial: 0, reserved: true, description: '수동 모드 가능 (예비)' },
  { name: 'TR_REQ', side: 'active', initial: 0, description: '이송 요청' },
  { name: 'BUSY', side: 'active', initial: 0, description: '이송 진행 중' },
  { name: 'COMPT', side: 'active', initial: 0, description: '이송 완료' },
  { name: 'CONT', side: 'active', initial: 0, reserved: true, description: '연속 이송 (예비)' },
]

/** Passive(수동 설비) → Active 방향 출력 8점 */
export const PIO_PASSIVE_SIGNALS: PioSignalDef[] = [
  { name: 'L_REQ', side: 'passive', initial: 0, description: '적재 요청 (자재 받을 준비)' },
  { name: 'U_REQ', side: 'passive', initial: 0, description: '반출 요청 (자재 있음)' },
  { name: 'READY', side: 'passive', initial: 0, description: '이송 준비 완료' },
  { name: 'HO_AVBL', side: 'passive', initial: 1, description: '핸드오프 가능 (정상 시 항상 ON)' },
  { name: 'ES', side: 'passive', initial: 1, description: '비상 정지 아님 (정상 시 항상 ON)' },
  { name: 'SPARE_1', side: 'passive', initial: 0, reserved: true, description: '예비 1' },
  { name: 'SPARE_2', side: 'passive', initial: 0, reserved: true, description: '예비 2' },
  { name: 'SPARE_3', side: 'passive', initial: 0, reserved: true, description: '예비 3' },
]

export const PIO_ALL_SIGNALS: PioSignalDef[] = [
  ...PIO_ACTIVE_SIGNALS,
  ...PIO_PASSIVE_SIGNALS,
]

export function pioSignalInitial(name: string): 0 | 1 {
  return PIO_ALL_SIGNALS.find((s) => s.name === name)?.initial ?? 0
}

/** LOAD → L_REQ, UNLOAD → U_REQ */
export function pioReqSignal(operation: PioOperation): string {
  return operation === 'LOAD' ? 'L_REQ' : 'U_REQ'
}

// ── 단계 정의 ────────────────────────────────────────────────────────────────

export const PIO_STEP_ORDER: PioStepId[] = [
  'T1_VALID_REQ',
  'T2_REQ_TRREQ',
  'T3_TRREQ_READY',
  'T4_READY_BUSY',
  'T5_BUSY_CARRIER',
  'T6_CARRIER_COMPT',
  'T7_COMPT_CLOSE',
]

export const PIO_STEP_LABELS: Record<PioStepId, string> = {
  T1_VALID_REQ: 'VALID → REQ (Passive 응답)',
  T2_REQ_TRREQ: 'REQ → TR_REQ (이송 요청)',
  T3_TRREQ_READY: 'TR_REQ → READY (준비 완료)',
  T4_READY_BUSY: 'READY → BUSY (이송 개시)',
  T5_BUSY_CARRIER: 'BUSY → REQ↓ (자재 전달)',
  T6_CARRIER_COMPT: 'REQ↓ → COMPT (이송 정리)',
  T7_COMPT_CLOSE: 'COMPT → VALID↓ (종료)',
}

/** 단계별 지연 시 점검 포인트 — 코비 AI 원인 분석에 사용 */
export const PIO_STEP_CAUSES: Record<PioStepId, string> = {
  T1_VALID_REQ: 'Passive PLC 스캔타임·포트 재실 센서·인터락 상태 점검',
  T2_REQ_TRREQ: 'Active 컨트롤러 응답 지연 — 통신 부하·펌웨어 점검',
  T3_TRREQ_READY: 'Passive 안전센서·셔터/클램프 동작·인터락 해제 지연 점검',
  T4_READY_BUSY: 'Active 구동부(호이스트/서보) 기동 지연 점검',
  T5_BUSY_CARRIER: '이송 자체 지연 — 주행속도·위치 정렬(티칭)·그리퍼 동작 점검',
  T6_CARRIER_COMPT: '자재 감지(Presence/Placement) 센서 응답 점검',
  T7_COMPT_CLOSE: '완료 처리 시퀀스·상위 통신(HOST 보고) 지연 점검',
}

/** 기본 골든 베이스라인 (ms) */
export const DEFAULT_PIO_BASELINE: PioBaseline = {
  steps: {
    T1_VALID_REQ: 100,
    T2_REQ_TRREQ: 100,
    T3_TRREQ_READY: 150,
    T4_READY_BUSY: 150,
    T5_BUSY_CARRIER: 2000,
    T6_CARRIER_COMPT: 150,
    T7_COMPT_CLOSE: 250,
  },
  warnPct: 30,
  overPct: 60,
  source: '기본값 (E84 표준 권장)',
}

// ── 시퀀스 스케줄 빌더 ───────────────────────────────────────────────────────
// 시퀀서(실행)·베이스라인 오버레이(차트 고스트)·데모가 모두 이 빌더를 공유한다.

/**
 * 단계 시간(ms) → 엣지 스케줄.
 *
 * t0        : ES↑ HO_AVBL↑ (초기 상태 명시) + VALID↑ CS_0↑
 * +T1       : REQ↑
 * +T2       : TR_REQ↑
 * +T3       : READY↑
 * +T4       : BUSY↑
 * +T5       : REQ↓ (자재 전달 완료)
 * +T6       : BUSY↓ COMPT↑
 * +T7×0.5   : READY↓
 * +T7       : COMPT↓ VALID↓ CS_0↓ TR_REQ↓ → 완료
 */
export function buildPioSchedule(
  operation: PioOperation,
  steps: Record<PioStepId, number>,
): PioEdge[] {
  const req = pioReqSignal(operation)
  const edges: PioEdge[] = []
  let t = 0

  edges.push({ signal: 'ES', value: 1, t })
  edges.push({ signal: 'HO_AVBL', value: 1, t })
  edges.push({ signal: 'VALID', value: 1, t })
  edges.push({ signal: 'CS_0', value: 1, t })

  t += steps.T1_VALID_REQ
  edges.push({ signal: req, value: 1, t })

  t += steps.T2_REQ_TRREQ
  edges.push({ signal: 'TR_REQ', value: 1, t })

  t += steps.T3_TRREQ_READY
  edges.push({ signal: 'READY', value: 1, t })

  t += steps.T4_READY_BUSY
  edges.push({ signal: 'BUSY', value: 1, t })

  t += steps.T5_BUSY_CARRIER
  edges.push({ signal: req, value: 0, t })

  t += steps.T6_CARRIER_COMPT
  edges.push({ signal: 'BUSY', value: 0, t })
  edges.push({ signal: 'COMPT', value: 1, t })

  const closeHalf = Math.round(steps.T7_COMPT_CLOSE * 0.5)
  edges.push({ signal: 'READY', value: 0, t: t + closeHalf })

  t += steps.T7_COMPT_CLOSE
  edges.push({ signal: 'COMPT', value: 0, t })
  edges.push({ signal: 'TR_REQ', value: 0, t })
  edges.push({ signal: 'VALID', value: 0, t })
  edges.push({ signal: 'CS_0', value: 0, t })

  return edges
}

/** 스케줄 전체 시간을 목표(ms)에 맞게 비율 조정 */
export function scalePioSteps(
  steps: Record<PioStepId, number>,
  targetTotalMs: number,
): Record<PioStepId, number> {
  const total = PIO_STEP_ORDER.reduce((sum, id) => sum + steps[id], 0)
  if (total <= 0) return steps
  const factor = targetTotalMs / total
  const scaled = {} as Record<PioStepId, number>
  for (const id of PIO_STEP_ORDER) {
    scaled[id] = Math.max(10, Math.round(steps[id] * factor))
  }
  return scaled
}
