import type { PioEdge, PioStepId } from '../types/pio'
import {
  buildPioSchedule,
  scalePioSteps,
  DEFAULT_PIO_BASELINE,
  PIO_STEP_ORDER,
} from '../constants/pioSignals'
import { usePioStore, type BeginPioInput } from '../store/usePioStore'

export type PioAnomaly =
  | { type: 'delay'; step: PioStepId; extraMs: number }
  | { type: 'error'; atStep: PioStepId }

export interface RunPioSequenceOptions extends BeginPioInput {
  /** 단계 시간 (기본: 해당 쌍 유형의 골든 베이스라인) */
  steps?: Record<PioStepId, number>
  /** 시퀀스 전체를 이 시간(ms)에 맞게 비율 조정 — 시뮬 dwell에 맞출 때 사용 */
  scaleToTotalMs?: number
  /** 이상 주입 — 데모·인터페이스 테스트용 */
  anomaly?: PioAnomaly
}

/** 단계별 종료 시각(누적 ms) 계산 — 오류 주입 지점 결정용 */
function stepEndTimes(steps: Record<PioStepId, number>): Record<PioStepId, number> {
  let t = 0
  const out = {} as Record<PioStepId, number>
  for (const id of PIO_STEP_ORDER) {
    t += steps[id]
    out[id] = t
  }
  return out
}

const runningTimers = new Map<string, number[]>()

/** 실행 중인 시퀀스 전체 취소 (트랜잭션은 error로 종료하지 않고 그대로 둠) */
export function cancelAllPioSequences(): void {
  for (const timers of runningTimers.values()) {
    for (const t of timers) window.clearTimeout(t)
  }
  runningTimers.clear()
}

/**
 * PIO 핸드셰이크 시퀀스 실행.
 * 스케줄에 따라 엣지를 시간차로 기록하고 완료 시 트랜잭션을 닫는다.
 * 반환: 트랜잭션 ID
 */
export function runPioSequence(options: RunPioSequenceOptions): string {
  const store = usePioStore.getState()
  const baseSteps =
    options.steps ?? store.baselines[options.pairKind]?.steps ?? DEFAULT_PIO_BASELINE.steps

  let steps = { ...baseSteps }
  if (options.scaleToTotalMs != null) {
    steps = scalePioSteps(steps, options.scaleToTotalMs)
  }
  if (options.anomaly?.type === 'delay') {
    steps[options.anomaly.step] += options.anomaly.extraMs
  }

  let schedule = buildPioSchedule(options.operation, steps)
  let errorAtMs: number | null = null

  if (options.anomaly?.type === 'error') {
    // 해당 단계 종료 직전에 ES↓ HO_AVBL↓ 발생 후 중단
    const ends = stepEndTimes(steps)
    const stepEnd = ends[options.anomaly.atStep]
    errorAtMs = Math.max(10, stepEnd - 20)
    schedule = schedule.filter((e) => e.t < errorAtMs!)
    schedule.push({ signal: 'ES', value: 0, t: errorAtMs })
    schedule.push({ signal: 'HO_AVBL', value: 0, t: errorAtMs })
  }

  const txId = store.beginTransaction({
    pairKind: options.pairKind,
    operation: options.operation,
    activeName: options.activeName,
    passiveName: options.passiveName,
    source: options.source,
  })

  // 같은 t의 엣지를 묶어 스토어 업데이트 횟수 최소화
  const byTime = new Map<number, PioEdge[]>()
  for (const edge of schedule) {
    const list = byTime.get(edge.t) ?? []
    list.push(edge)
    byTime.set(edge.t, list)
  }

  const times = [...byTime.keys()].sort((a, b) => a - b)
  const lastT = times[times.length - 1] ?? 0
  const timers: number[] = []

  for (const t of times) {
    const edges = byTime.get(t)!
    timers.push(
      window.setTimeout(() => {
        usePioStore.getState().addEdges(txId, edges)
        if (t === lastT) {
          usePioStore
            .getState()
            .completeTransaction(
              txId,
              errorAtMs != null ? 'error' : 'complete',
              options.anomaly?.type === 'error' ? options.anomaly.atStep : undefined,
            )
          runningTimers.delete(txId)
        }
      }, t),
    )
  }
  runningTimers.set(txId, timers)

  return txId
}
