import type {
  PioBaseline,
  PioSide,
  PioStepId,
  PioStepMeasure,
  PioTransaction,
} from '../types/pio'
import { pioReqSignal } from '../constants/pioSignals'

/** 특정 신호(측+레벨)의 n번째 전환 시각 검색 */
function edgeTime(
  tx: PioTransaction,
  signal: string,
  side: PioSide,
  value: 0 | 1,
  nth = 0,
): number | null {
  let count = 0
  for (const e of tx.edges) {
    if (e.signal === signal && e.side === side && e.value === value) {
      if (count === nth) return e.t
      count += 1
    }
  }
  return null
}

function buildMeasures(
  baseline: PioBaseline,
  bounds: Record<PioStepId, [number | null, number | null]>,
): PioStepMeasure[] {
  return baseline.stepOrder.map((step) => {
    const def = baseline.stepDefs[step]!
    const [fromMs, toMs] = bounds[step] ?? [null, null]
    const baselineMs = baseline.steps[step] ?? 0

    if (fromMs == null || toMs == null) {
      return {
        step,
        label: def.label,
        fromMs,
        toMs,
        durationMs: null,
        baselineMs,
        deviationMs: null,
        status: 'missing' as const,
        cause: def.cause,
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
      label: def.label,
      fromMs,
      toMs,
      durationMs,
      baselineMs,
      deviationMs,
      status,
      cause: def.cause,
    }
  })
}

/** E84 프로토콜 — MODULE_OHT / MODULE_AGV */
function computeE84Measures(tx: PioTransaction, baseline: PioBaseline): PioStepMeasure[] {
  const req = pioReqSignal(tx.operation)
  const bounds: Record<PioStepId, [number | null, number | null]> = {
    T1_VALID_REQ: [edgeTime(tx, 'VALID', 'active', 1), edgeTime(tx, req, 'passive', 1)],
    T2_REQ_TRREQ: [edgeTime(tx, req, 'passive', 1), edgeTime(tx, 'TR_REQ', 'active', 1)],
    T3_TRREQ_READY: [edgeTime(tx, 'TR_REQ', 'active', 1), edgeTime(tx, 'READY', 'passive', 1)],
    T4_READY_BUSY: [edgeTime(tx, 'READY', 'passive', 1), edgeTime(tx, 'BUSY', 'active', 1)],
    T5_BUSY_CARRIER: [edgeTime(tx, 'BUSY', 'active', 1), edgeTime(tx, req, 'passive', 0)],
    T6_CARRIER_COMPT: [edgeTime(tx, req, 'passive', 0), edgeTime(tx, 'COMPT', 'active', 1)],
    T7_COMPT_CLOSE: [edgeTime(tx, 'COMPT', 'active', 1), edgeTime(tx, 'VALID', 'active', 0)],
  }
  return buildMeasures(baseline, bounds)
}

/** STATUS 프로토콜 — CV↔CV / CV↔PORT: 실제 시뮬 상태값(LD/ULD/BUSY) 기준 단일 구간 측정 */
function computeCnvStatusMeasures(tx: PioTransaction, baseline: PioBaseline): PioStepMeasure[] {
  const bounds: Record<PioStepId, [number | null, number | null]> = {
    S1_TRANSFER: [edgeTime(tx, 'BUSY', 'active', 1), edgeTime(tx, 'BUSY', 'active', 0)],
  }
  return buildMeasures(baseline, bounds)
}

/** STATUS 프로토콜 — PORT↔STK: PortSimStatus/StorageSimStatus 기준 2구간 측정 */
function computePortStkMeasures(tx: PioTransaction, baseline: PioBaseline): PioStepMeasure[] {
  const bounds: Record<PioStepId, [number | null, number | null]> = {
    S1_WAIT: [0, edgeTime(tx, 'READY', 'passive', 1)],
    S2_TRANSFER: [edgeTime(tx, 'BUSY', 'active', 1), edgeTime(tx, 'BUSY', 'active', 0)],
  }
  return buildMeasures(baseline, bounds)
}

/** 트랜잭션 엣지 → 단계별 측정. 기준선과 비교해 ok/warn/over 판정 */
export function computePioMeasures(tx: PioTransaction, baseline: PioBaseline): PioStepMeasure[] {
  if (baseline.protocol === 'E84') return computeE84Measures(tx, baseline)
  if (tx.pairKind === 'PORT_STK') return computePortStkMeasures(tx, baseline)
  return computeCnvStatusMeasures(tx, baseline)
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
