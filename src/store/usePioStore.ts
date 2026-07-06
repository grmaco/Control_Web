import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  PioBaseline,
  PioEdge,
  PioOperation,
  PioPairKind,
  PioSource,
  PioStepId,
  PioTransaction,
  PioTransactionStatus,
} from '../types/pio'
import {
  DEFAULT_PIO_BASELINE,
  PIO_STEP_ORDER,
  scalePioSteps,
} from '../constants/pioSignals'
import { computePioMeasures } from '../utils/pioMeasure'

const MAX_TRANSACTIONS = 150
const BASELINE_STORAGE_KEY = 'conveyor.pio.baselines'

/** 쌍 유형별 기본 베이스라인 — 각 시뮬레이션의 실제 핸드셰이크 총 시간에 맞춤 */
function defaultBaselines(): Record<PioPairKind, PioBaseline> {
  const make = (totalMs: number, label: string): PioBaseline => ({
    ...DEFAULT_PIO_BASELINE,
    steps: scalePioSteps(DEFAULT_PIO_BASELINE.steps, totalMs),
    source: `기본값 (${label})`,
  })
  return {
    CNV_CNV: make(1000, 'CV↔CV 1.0s'),
    CNV_PORT: make(1000, 'CV↔PORT 1.0s'),
    PORT_STK: make(4000, 'PORT↔STK 4.0s'),
    MODULE_OHT: make(1400, 'MODULE↔OHT 1.4s'),
    MODULE_AGV: make(1400, 'MODULE↔AGV 1.4s'),
  }
}

function loadBaselines(): Record<PioPairKind, PioBaseline> {
  const defaults = defaultBaselines()
  try {
    const raw = localStorage.getItem(BASELINE_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Record<PioPairKind, PioBaseline>>
    for (const kind of Object.keys(defaults) as PioPairKind[]) {
      const saved = parsed[kind]
      if (saved && PIO_STEP_ORDER.every((s) => typeof saved.steps?.[s] === 'number')) {
        defaults[kind] = saved
      }
    }
  } catch {
    /* ignore */
  }
  return defaults
}

function persistBaselines(baselines: Record<PioPairKind, PioBaseline>): void {
  try {
    localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(baselines))
  } catch {
    /* ignore */
  }
}

export interface BeginPioInput {
  pairKind: PioPairKind
  operation: PioOperation
  activeName: string
  passiveName: string
  source: PioSource
}

interface PioState {
  transactions: PioTransaction[]
  baselines: Record<PioPairKind, PioBaseline>

  beginTransaction: (input: BeginPioInput) => string
  /** 상대 시각이 명시된 엣지 추가 (시퀀서 — 스케줄 기준) */
  addEdges: (id: string, edges: PioEdge[]) => void
  /** 현재 시각으로 엣지 추가 (실측 — 시뮬 tick·V3 수신 시점) */
  addEdgesNow: (id: string, signals: Array<{ signal: string; value: 0 | 1 }>) => void
  completeTransaction: (
    id: string,
    status: Exclude<PioTransactionStatus, 'running'>,
    errorStep?: PioStepId,
  ) => void
  /** 완료된 트랜잭션의 측정값을 해당 쌍 유형의 골든 베이스라인으로 설정 */
  setBaselineFromTransaction: (id: string) => boolean
  resetBaseline: (pairKind: PioPairKind) => void
  clearTransactions: () => void
}

export const usePioStore = create<PioState>((set, get) => ({
  transactions: [],
  baselines: loadBaselines(),

  beginTransaction: (input) => {
    const id = uuidv4()
    const tx: PioTransaction = {
      id,
      ...input,
      startedAt: Date.now(),
      endedAt: null,
      status: 'running',
      edges: [],
    }
    set((s) => ({
      transactions: [tx, ...s.transactions].slice(0, MAX_TRANSACTIONS),
    }))
    return id
  },

  addEdges: (id, edges) => {
    if (edges.length === 0) return
    set((s) => ({
      transactions: s.transactions.map((tx) =>
        tx.id === id && tx.status === 'running'
          ? { ...tx, edges: [...tx.edges, ...edges] }
          : tx,
      ),
    }))
  },

  addEdgesNow: (id, signals) => {
    if (signals.length === 0) return
    const tx = get().transactions.find((t) => t.id === id)
    if (!tx || tx.status !== 'running') return
    const t = Date.now() - tx.startedAt
    get().addEdges(
      id,
      signals.map(({ signal, value }) => ({ signal, value, t })),
    )
  },

  completeTransaction: (id, status, errorStep) => {
    set((s) => ({
      transactions: s.transactions.map((tx) =>
        tx.id === id && tx.status === 'running'
          ? { ...tx, status, errorStep, endedAt: Date.now() }
          : tx,
      ),
    }))
  },

  setBaselineFromTransaction: (id) => {
    const tx = get().transactions.find((t) => t.id === id)
    if (!tx || tx.status !== 'complete') return false

    const current = get().baselines[tx.pairKind]
    const measures = computePioMeasures(tx, current)
    // 모든 단계가 측정되어야 기준으로 사용 가능
    if (measures.some((m) => m.durationMs == null)) return false

    const steps = { ...current.steps }
    for (const m of measures) {
      if (m.durationMs != null) steps[m.step] = Math.max(10, Math.round(m.durationMs))
    }
    const next: PioBaseline = {
      ...current,
      steps,
      source: `${tx.activeName}↔${tx.passiveName} 캡처 (${new Date(tx.startedAt).toLocaleTimeString('ko-KR')})`,
    }
    const baselines = { ...get().baselines, [tx.pairKind]: next }
    persistBaselines(baselines)
    set({ baselines })
    return true
  },

  resetBaseline: (pairKind) => {
    const baselines = { ...get().baselines, [pairKind]: defaultBaselines()[pairKind] }
    persistBaselines(baselines)
    set({ baselines })
  },

  clearTransactions: () => set({ transactions: [] }),
}))
