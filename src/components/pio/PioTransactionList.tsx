import { useMemo, useState } from 'react'
import type {
  PioPairKind,
  PioSource,
  PioTransactionStatus,
} from '../../types/pio'
import { usePioStore } from '../../store/usePioStore'
import { PIO_PAIR_LABELS } from '../../constants/pioSignals'
import { computePioMeasures, hasPioAnomaly, pioTransactionDuration } from '../../utils/pioMeasure'

const SOURCE_LABELS: Record<PioSource, string> = {
  'sim-oht': 'OHT 시뮬',
  'sim-port': '창고 시뮬',
  'sim-path': '경로 시뮬',
  v3: 'V3',
  demo: '데모',
}

const STATUS_BADGE: Record<PioTransactionStatus, { label: string; cls: string }> = {
  running: { label: '진행 중', cls: 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300' },
  complete: { label: '완료', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  error: { label: '오류', cls: 'border-red-500/50 bg-red-500/15 text-red-300' },
}

/** 트랜잭션 목록 — 필터 + 선택 */
export function PioTransactionList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const transactions = usePioStore((s) => s.transactions)
  const baselines = usePioStore((s) => s.baselines)
  const [pairFilter, setPairFilter] = useState<PioPairKind | ''>('')
  const [statusFilter, setStatusFilter] = useState<PioTransactionStatus | ''>('')

  const filtered = useMemo(
    () =>
      transactions.filter(
        (tx) =>
          (!pairFilter || tx.pairKind === pairFilter) &&
          (!statusFilter || tx.status === statusFilter),
      ),
    [transactions, pairFilter, statusFilter],
  )

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPairFilter('')}
          className={`rounded-full border px-2.5 py-0.5 text-[10.5px] ${
            pairFilter === ''
              ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
              : 'border-slate-700 text-slate-400 hover:border-slate-500'
          }`}
        >
          전체
        </button>
        {(Object.keys(PIO_PAIR_LABELS) as PioPairKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setPairFilter(pairFilter === kind ? '' : kind)}
            className={`rounded-full border px-2.5 py-0.5 text-[10.5px] ${
              pairFilter === kind
                ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {PIO_PAIR_LABELS[kind]}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-700" />
        {(['running', 'complete', 'error'] as PioTransactionStatus[]).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(statusFilter === st ? '' : st)}
            className={`rounded-full border px-2.5 py-0.5 text-[10.5px] ${
              statusFilter === st
                ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {STATUS_BADGE[st].label}
          </button>
        ))}
        <span className="ml-auto text-[10.5px] text-slate-500">
          {filtered.length}건 / 전체 {transactions.length}건
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">
          기록된 핸드셰이크가 없습니다 — 시뮬레이션을 실행하거나 데모를 생성해보세요.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {filtered.map((tx) => {
            const anomaly =
              tx.status === 'complete' &&
              hasPioAnomaly(computePioMeasures(tx, baselines[tx.pairKind]))
            const badge = STATUS_BADGE[tx.status]
            const selected = tx.id === selectedId
            return (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => onSelect(selected ? null : tx.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                    selected
                      ? 'border-cyan-400/60 bg-cyan-500/10'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'
                  }`}
                >
                  <span className="w-14 shrink-0 font-mono text-[10px] text-slate-500">
                    {new Date(tx.startedAt).toLocaleTimeString('ko-KR', { hour12: false })}
                  </span>
                  <span className="shrink-0 rounded border border-slate-600/60 bg-slate-800/80 px-1.5 py-px text-[9.5px] text-slate-300">
                    {PIO_PAIR_LABELS[tx.pairKind]}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-bold ${
                      tx.operation === 'LOAD' ? 'text-cyan-300' : 'text-violet-300'
                    }`}
                  >
                    {tx.operation}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-300">
                    {tx.activeName} → {tx.passiveName}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    {Math.round(pioTransactionDuration(tx))}ms
                  </span>
                  {anomaly && (
                    <span
                      className="shrink-0 text-[10px] font-bold text-red-400"
                      title="기준 초과 구간 있음"
                    >
                      ⚠
                    </span>
                  )}
                  <span
                    className={`shrink-0 rounded border px-1.5 py-px text-[9.5px] ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <span className="shrink-0 text-[9.5px] text-slate-500">
                    {SOURCE_LABELS[tx.source]}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
