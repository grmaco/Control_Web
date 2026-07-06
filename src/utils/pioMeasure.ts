import type {
  PioBaseline,
  PioStepId,
  PioStepMeasure,
  PioTransaction,
} from '../types/pio'
import {
  PIO_STEP_LABELS,
  PIO_STEP_ORDER,
  pioReqSignal,
} from '../constants/pioSignals'

/** 특정 신호의 특정 레벨 전환 시각 검색 (n번째 발생) */
function edgeTime(
  tx: PioTransaction,
  signal: string,
  value: 0 | 1,
  nth = 0,
): number | null {
  let count = 0
  for (const e of tx.edges) {
    if (e.signal === signal && e.value === value) {
      if (count === nth) return e.t
      count += 1
    }
  }
  return null
}

/** 트랜잭션 엣지 → 단계별 측정. 기준선과 비교해 ok/warn/over 판정 */
export function computePioMeasures(
  tx: PioTransaction,
  baseline: PioBaseline,
): PioStepMeasure[] {
  const req = pioReqSignal(tx.operation)

  // 단계 경계 시각
  const bounds: Record<PioStepId, [number | null, number | null]> = {
    T1_VALID_REQ: [edgeTime(tx, 'VALID', 1), edgeTime(tx, req, 1)],
    T2_REQ_TRREQ: [edgeTime(tx, req, 1), edgeTime(tx, 'TR_REQ', 1)],
    T3_TRREQ_READY: [edgeTime(tx, 'TR_REQ', 1), edgeTime(tx, 'READY', 1)],
    T4_READY_BUSY: [edgeTime(tx, 'READY', 1), edgeTime(tx, 'BUSY', 1)],
    T5_BUSY_CARRIER: [edgeTime(tx, 'BUSY', 1), edgeTime(tx, req, 0)],
    T6_CARRIER_COMPT: [edgeTime(tx, req, 0), edgeTime(tx, 'COMPT', 1)],
    T7_COMPT_CLOSE: [edgeTime(tx, 'COMPT', 1), edgeTime(tx, 'VALID', 0)],
  }

  return PIO_STEP_ORDER.map((step) => {
    const [fromMs, toMs] = bounds[step]
    const baselineMs = baseline.steps[step]

    if (fromMs == null || toMs == null) {
      return {
        step,
        label: PIO_STEP_LABELS[step],
        fromMs,
        toMs,
        durationMs: null,
        baselineMs,
        deviationMs: null,
        status: 'missing' as const,
      }
    }

    const durationMs = toMs - fromMs
    const deviationMs = durationMs - baselineMs
    const overMs = (baselineMs * baseline.overPct) / 100
    const warnMs = (baselineMs * baseline.warnPct) / 100
    const status =
      deviationMs > overMs ? ('over' as const)
      : deviationMs > warnMs ? ('warn' as const)
      : ('ok' as const)

    return {
      step,
      label: PIO_STEP_LABELS[step],
      fromMs,
      toMs,
      durationMs,
      baselineMs,
      deviationMs,
      status,
    }
  })
}

/** 트랜잭션 총 소요 시간 (마지막 엣지 기준, ms) */
export function pioTransactionDuration(tx: PioTransaction): number {
  let max = 0
  for (const e of tx.edges) if (e.t > max) max = e.t
  if (tx.status === 'running') {
    return Math.max(max, Date.now() - tx.startedAt)
  }
  return max
}

/** 이상 여부 요약 — 하나라도 over면 true */
export function hasPioAnomaly(measures: PioStepMeasure[]): boolean {
  return measures.some((m) => m.status === 'over')
}
