import type {
  PioBaseline,
  PioEdge,
  PioOperation,
  PioPairKind,
  PioProtocol,
  PioSide,
  PioStepDef,
  PioStepId,
} from '../types/pio'

export const PIO_PAIR_LABELS: Record<PioPairKind, string> = {
  CNV_CNV: 'CV↔CV',
  CNV_TURN: 'CV↔TCV',
  CNV_PORT: 'CV↔PORT',
  PORT_STK: 'PORT↔STK',
  MODULE_OHT: 'MODULE↔OHT',
  MODULE_AGV: 'MODULE↔AGV',
}

/**
 * 프로토콜 결정 — MODULE_OHT/MODULE_AGV만 AMHS 차량이 설비 포트에 도킹하는
 * 정식 SEMI E84 대상. 나머지(CNV_CNV/CNV_PORT/PORT_STK)는 이 앱이 실제로
 * 시뮬레이션하는 상태값(LD/ULD/BUSY 등)만 사용 — E84 신호가 실재하지 않는다.
 */
export function pioProtocolForPair(kind: PioPairKind): PioProtocol {
  return kind === 'MODULE_OHT' || kind === 'MODULE_AGV' ? 'E84' : 'STATUS'
}

export interface PioSignalDef {
  name: string
  side: PioSide
  /** 트랜잭션 시작 시 초기 레벨 */
  initial: 0 | 1
  /** 예비 신호 — 차트에서 접어서 표시 */
  reserved?: boolean
  description: string
}

// ══════════════════════════════════════════════════════════════════════════
// E84 프로토콜 — MODULE_OHT / MODULE_AGV 전용
// ══════════════════════════════════════════════════════════════════════════

/** Active(운반 설비) → Passive 방향 출력 8점 */
export const E84_ACTIVE_SIGNALS: PioSignalDef[] = [
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
export const E84_PASSIVE_SIGNALS: PioSignalDef[] = [
  { name: 'L_REQ', side: 'passive', initial: 0, description: '적재 요청 (자재 받을 준비)' },
  { name: 'U_REQ', side: 'passive', initial: 0, description: '반출 요청 (자재 있음)' },
  { name: 'READY', side: 'passive', initial: 0, description: '이송 준비 완료' },
  { name: 'HO_AVBL', side: 'passive', initial: 1, description: '핸드오프 가능 (정상 시 항상 ON)' },
  { name: 'ES', side: 'passive', initial: 1, description: '비상 정지 아님 (정상 시 항상 ON)' },
  { name: 'SPARE_1', side: 'passive', initial: 0, reserved: true, description: '예비 1' },
  { name: 'SPARE_2', side: 'passive', initial: 0, reserved: true, description: '예비 2' },
  { name: 'SPARE_3', side: 'passive', initial: 0, reserved: true, description: '예비 3' },
]

const E84_ALL_SIGNALS: PioSignalDef[] = [...E84_ACTIVE_SIGNALS, ...E84_PASSIVE_SIGNALS]

/** LOAD → L_REQ, UNLOAD → U_REQ */
export function pioReqSignal(operation: PioOperation): string {
  return operation === 'LOAD' ? 'L_REQ' : 'U_REQ'
}

const E84_STEP_ORDER: PioStepId[] = [
  'T1_VALID_REQ',
  'T2_REQ_TRREQ',
  'T3_TRREQ_READY',
  'T4_READY_BUSY',
  'T5_BUSY_CARRIER',
  'T6_CARRIER_COMPT',
  'T7_COMPT_CLOSE',
]

const E84_STEP_DEFS: Record<string, PioStepDef> = {
  T1_VALID_REQ: {
    id: 'T1_VALID_REQ',
    label: 'VALID → REQ (Passive 응답)',
    cause: 'Passive PLC 스캔타임·포트 재실 센서·인터락 상태 점검',
  },
  T2_REQ_TRREQ: {
    id: 'T2_REQ_TRREQ',
    label: 'REQ → TR_REQ (이송 요청)',
    cause: 'Active 컨트롤러 응답 지연 — 통신 부하·펌웨어 점검',
  },
  T3_TRREQ_READY: {
    id: 'T3_TRREQ_READY',
    label: 'TR_REQ → READY (준비 완료)',
    cause: 'Passive 안전센서·셔터/클램프 동작·인터락 해제 지연 점검',
  },
  T4_READY_BUSY: {
    id: 'T4_READY_BUSY',
    label: 'READY → BUSY (이송 개시)',
    cause: 'Active 구동부(호이스트/서보) 기동 지연 점검',
  },
  T5_BUSY_CARRIER: {
    id: 'T5_BUSY_CARRIER',
    label: 'BUSY → REQ↓ (자재 전달)',
    cause: '이송 자체 지연 — 주행속도·위치 정렬(티칭)·그리퍼 동작 점검',
  },
  T6_CARRIER_COMPT: {
    id: 'T6_CARRIER_COMPT',
    label: 'REQ↓ → COMPT (이송 정리)',
    cause: '자재 감지(Presence/Placement) 센서 응답 점검',
  },
  T7_COMPT_CLOSE: {
    id: 'T7_COMPT_CLOSE',
    label: 'COMPT → VALID↓ (종료)',
    cause: '완료 처리 시퀀스·상위 통신(HOST 보고) 지연 점검',
  },
}

/**
 * E84 단계 시간(ms) → 엣지 스케줄.
 * t0: ES↑ HO_AVBL↑ VALID↑ CS_0↑ / +T1: REQ↑ / +T2: TR_REQ↑ / +T3: READY↑ /
 * +T4: BUSY↑ / +T5: REQ↓ / +T6: BUSY↓ COMPT↑ / +T7×0.5: READY↓ / +T7: 전체 종료
 */
export function buildE84Schedule(
  operation: PioOperation,
  steps: Record<PioStepId, number>,
): PioEdge[] {
  const req = pioReqSignal(operation)
  const edges: PioEdge[] = []
  let t = 0
  const A = 'active' as const
  const P = 'passive' as const

  edges.push({ signal: 'ES', side: P, value: 1, t })
  edges.push({ signal: 'HO_AVBL', side: P, value: 1, t })
  edges.push({ signal: 'VALID', side: A, value: 1, t })
  edges.push({ signal: 'CS_0', side: A, value: 1, t })

  t += steps.T1_VALID_REQ!
  edges.push({ signal: req, side: P, value: 1, t })

  t += steps.T2_REQ_TRREQ!
  edges.push({ signal: 'TR_REQ', side: A, value: 1, t })

  t += steps.T3_TRREQ_READY!
  edges.push({ signal: 'READY', side: P, value: 1, t })

  t += steps.T4_READY_BUSY!
  edges.push({ signal: 'BUSY', side: A, value: 1, t })

  t += steps.T5_BUSY_CARRIER!
  edges.push({ signal: req, side: P, value: 0, t })

  t += steps.T6_CARRIER_COMPT!
  edges.push({ signal: 'BUSY', side: A, value: 0, t })
  edges.push({ signal: 'COMPT', side: A, value: 1, t })

  const closeHalf = Math.round(steps.T7_COMPT_CLOSE! * 0.5)
  edges.push({ signal: 'READY', side: P, value: 0, t: t + closeHalf })

  t += steps.T7_COMPT_CLOSE!
  edges.push({ signal: 'COMPT', side: A, value: 0, t })
  edges.push({ signal: 'TR_REQ', side: A, value: 0, t })
  edges.push({ signal: 'VALID', side: A, value: 0, t })
  edges.push({ signal: 'CS_0', side: A, value: 0, t })

  return edges
}

// ══════════════════════════════════════════════════════════════════════════
// STATUS 프로토콜 — CNV_CNV / CNV_PORT / PORT_STK
// 이 앱이 실제로 시뮬레이션하는 상태값을 그대로 신호처럼 기록 (E84 신호 아님)
// ══════════════════════════════════════════════════════════════════════════

/** CV↔CV, CV↔PORT — 양측 모두 실제 컨베이어 전송 상태(LD/ULD/BUSY)를 사용 */
export const CNV_STATUS_SIGNALS: PioSignalDef[] = [
  { name: 'LD', side: 'active', initial: 1, description: '자재 없음 (적재 가능)' },
  { name: 'ULD', side: 'active', initial: 0, description: '자재 있음' },
  { name: 'BUSY', side: 'active', initial: 0, description: '이송 중' },
]
export const CNV_STATUS_SIGNALS_PASSIVE: PioSignalDef[] = CNV_STATUS_SIGNALS.map((s) => ({
  ...s,
  side: 'passive' as const,
}))

const CNV_STEP_ORDER: PioStepId[] = ['S1_TRANSFER']
const CNV_STEP_DEFS: Record<string, PioStepDef> = {
  S1_TRANSFER: {
    id: 'S1_TRANSFER',
    label: 'BUSY 구간 (자재 이송)',
    cause: '컨베이어 속도·모터 부하·상하류 정체 여부 점검',
  },
}

/** 회전 컨베이어(TCV) — 회전각·정렬 시간이 더해져 직선보다 통과 시간이 길다 */
const TURN_STEP_DEFS: Record<string, PioStepDef> = {
  S1_TRANSFER: {
    id: 'S1_TRANSFER',
    label: 'BUSY 구간 (회전 이송)',
    cause: '회전판 회전각·정렬·구동 부하·상하류 정체 여부 점검',
  },
}

/** PORT↔STK — 포트는 PortSimStatus, 창고는 StorageSimStatus (usePortStorageSimulation과 동일 enum) */
export const PORT_STK_ACTIVE_SIGNALS: PioSignalDef[] = [
  { name: 'IDLE', side: 'active', initial: 1, description: '대기 (반송 명령 없음)' },
  { name: 'TR', side: 'active', initial: 0, description: '반송 명령 수신' },
  { name: 'BUSY', side: 'active', initial: 0, description: '반송 진행 중' },
  { name: 'COMPLETE', side: 'active', initial: 0, description: '반송 완료' },
]
export const PORT_STK_PASSIVE_SIGNALS: PioSignalDef[] = [
  { name: 'LD', side: 'passive', initial: 0, description: '자재 없음' },
  { name: 'ULD', side: 'passive', initial: 1, description: '자재 있음' },
  { name: 'READY', side: 'passive', initial: 0, description: '반출 준비 완료' },
  { name: 'BUSY', side: 'passive', initial: 0, description: '반출 진행 중' },
]

const PORT_STK_STEP_ORDER: PioStepId[] = ['S1_WAIT', 'S2_TRANSFER']
const PORT_STK_STEP_DEFS: Record<string, PioStepDef> = {
  S1_WAIT: {
    id: 'S1_WAIT',
    label: '명령 → READY (응답 대기)',
    cause: '포트 안전센서·재실 확인 응답 지연 점검',
  },
  S2_TRANSFER: {
    id: 'S2_TRANSFER',
    label: 'BUSY 구간 (반송 진행)',
    cause: '스토커 반송 로봇 주행·랙 정렬 지연 점검',
  },
}

/** 쌍 유형별 Active/Passive 신호 정의 */
export function pioSignalSetForPair(
  kind: PioPairKind,
): { active: PioSignalDef[]; passive: PioSignalDef[] } {
  switch (kind) {
    case 'MODULE_OHT':
    case 'MODULE_AGV':
      return { active: E84_ACTIVE_SIGNALS, passive: E84_PASSIVE_SIGNALS }
    case 'PORT_STK':
      return { active: PORT_STK_ACTIVE_SIGNALS, passive: PORT_STK_PASSIVE_SIGNALS }
    case 'CNV_CNV':
    case 'CNV_TURN':
    case 'CNV_PORT':
      return { active: CNV_STATUS_SIGNALS, passive: CNV_STATUS_SIGNALS_PASSIVE }
  }
}

function stepOrderForPair(kind: PioPairKind): PioStepId[] {
  if (pioProtocolForPair(kind) === 'E84') return E84_STEP_ORDER
  return kind === 'PORT_STK' ? PORT_STK_STEP_ORDER : CNV_STEP_ORDER
}

function stepDefsForPair(kind: PioPairKind): Record<string, PioStepDef> {
  if (pioProtocolForPair(kind) === 'E84') return E84_STEP_DEFS
  if (kind === 'PORT_STK') return PORT_STK_STEP_DEFS
  return kind === 'CNV_TURN' ? TURN_STEP_DEFS : CNV_STEP_DEFS
}

export function pioSignalInitial(kind: PioPairKind, name: string): 0 | 1 {
  if (pioProtocolForPair(kind) === 'E84') {
    return E84_ALL_SIGNALS.find((s) => s.name === name)?.initial ?? 0
  }
  const { active, passive } = pioSignalSetForPair(kind)
  return [...active, ...passive].find((s) => s.name === name)?.initial ?? 0
}

/** 기본 골든 베이스라인 생성 — 쌍 유형별 프로토콜에 맞는 단계 구성 + 임의 기본 시간 */
export function buildDefaultBaseline(kind: PioPairKind, totalMs: number, label: string): PioBaseline {
  const protocol = pioProtocolForPair(kind)
  const stepOrder = stepOrderForPair(kind)
  const stepDefs = stepDefsForPair(kind)

  let steps: Record<PioStepId, number>
  if (protocol === 'E84') {
    const ratio: Record<PioStepId, number> = {
      T1_VALID_REQ: 100,
      T2_REQ_TRREQ: 100,
      T3_TRREQ_READY: 150,
      T4_READY_BUSY: 150,
      T5_BUSY_CARRIER: 2000,
      T6_CARRIER_COMPT: 150,
      T7_COMPT_CLOSE: 250,
    }
    steps = scaleSteps(stepOrder, ratio, totalMs)
  } else if (kind === 'PORT_STK') {
    steps = scaleSteps(stepOrder, { S1_WAIT: 1, S2_TRANSFER: 3 }, totalMs)
  } else {
    steps = scaleSteps(stepOrder, { S1_TRANSFER: 1 }, totalMs)
  }

  return {
    protocol,
    stepOrder,
    stepDefs,
    steps,
    warnPct: 30,
    overPct: 60,
    source: `임의 설정 (${label}, 실측 후 교체 필요)`,
  }
}

/** 비율(ratio)을 목표 totalMs에 맞게 배분 */
function scaleSteps(
  order: PioStepId[],
  ratio: Record<string, number>,
  totalMs: number,
): Record<PioStepId, number> {
  const sum = order.reduce((s, id) => s + (ratio[id] ?? 1), 0)
  const out: Record<PioStepId, number> = {}
  for (const id of order) {
    out[id] = Math.max(10, Math.round(((ratio[id] ?? 1) / sum) * totalMs))
  }
  return out
}

/** 스케줄 전체 시간을 목표(ms)에 맞게 비율 조정 (기존 baseline.steps 재조정용) */
export function scalePioSteps(
  stepOrder: PioStepId[],
  steps: Record<PioStepId, number>,
  targetTotalMs: number,
): Record<PioStepId, number> {
  const total = stepOrder.reduce((sum, id) => sum + (steps[id] ?? 0), 0)
  if (total <= 0) return steps
  const factor = targetTotalMs / total
  const scaled: Record<PioStepId, number> = {}
  for (const id of stepOrder) {
    scaled[id] = Math.max(10, Math.round((steps[id] ?? 0) * factor))
  }
  return scaled
}

/** STATUS 프로토콜(CV↔CV, CV↔PORT) 스케줄 — 실제 시뮬 상태값만 사용, 데모·베이스라인 고스트 공용 */
export function buildCnvStatusSchedule(steps: Record<PioStepId, number>): PioEdge[] {
  const totalMs = steps.S1_TRANSFER ?? 500
  return [
    { signal: 'LD', side: 'active', value: 0, t: 0 },
    { signal: 'ULD', side: 'active', value: 1, t: 0 },
    { signal: 'BUSY', side: 'active', value: 1, t: 0 },
    // Passive도 Active와 동시에 롤러를 굴려야 자재가 실제로 넘어갈 수 있음
    { signal: 'BUSY', side: 'passive', value: 1, t: 0 },
    { signal: 'BUSY', side: 'active', value: 0, t: totalMs },
    { signal: 'BUSY', side: 'passive', value: 0, t: totalMs },
    { signal: 'ULD', side: 'active', value: 0, t: totalMs },
    { signal: 'LD', side: 'active', value: 1, t: totalMs },
    { signal: 'LD', side: 'passive', value: 0, t: totalMs },
    { signal: 'ULD', side: 'passive', value: 1, t: totalMs },
  ]
}

/** STATUS 프로토콜(PORT↔STK) 스케줄 — PortSimStatus/StorageSimStatus 그대로 사용 */
export function buildPortStkStatusSchedule(steps: Record<PioStepId, number>): PioEdge[] {
  const waitMs = steps.S1_WAIT ?? 1000
  const transferMs = steps.S2_TRANSFER ?? 3000
  const busyStart = waitMs
  const busyEnd = waitMs + transferMs
  return [
    { signal: 'IDLE', side: 'active', value: 0, t: 0 },
    { signal: 'TR', side: 'active', value: 1, t: 0 },
    { signal: 'READY', side: 'passive', value: 1, t: waitMs },
    { signal: 'BUSY', side: 'active', value: 1, t: busyStart },
    { signal: 'BUSY', side: 'passive', value: 1, t: busyStart },
    { signal: 'BUSY', side: 'active', value: 0, t: busyEnd },
    { signal: 'TR', side: 'active', value: 0, t: busyEnd },
    { signal: 'COMPLETE', side: 'active', value: 1, t: busyEnd },
    { signal: 'READY', side: 'passive', value: 0, t: busyEnd },
    { signal: 'BUSY', side: 'passive', value: 0, t: busyEnd },
    { signal: 'ULD', side: 'passive', value: 0, t: busyEnd },
    { signal: 'LD', side: 'passive', value: 1, t: busyEnd },
    { signal: 'COMPLETE', side: 'active', value: 0, t: busyEnd + 100 },
    { signal: 'IDLE', side: 'active', value: 1, t: busyEnd + 100 },
  ]
}

/** 쌍 유형에 맞는 스케줄 빌더 — 데모 실행·베이스라인 고스트 공용 */
export function buildScheduleForPair(
  pairKind: PioPairKind,
  operation: PioOperation,
  steps: Record<PioStepId, number>,
): PioEdge[] {
  const protocol = pioProtocolForPair(pairKind)
  if (protocol === 'E84') return buildE84Schedule(operation, steps)
  if (pairKind === 'PORT_STK') return buildPortStkStatusSchedule(steps)
  return buildCnvStatusSchedule(steps)
}
