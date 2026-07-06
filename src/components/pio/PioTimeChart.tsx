import { useMemo } from 'react'
import type { PioBaseline, PioEdge, PioTransaction } from '../../types/pio'
import {
  buildPioSchedule,
  PIO_ACTIVE_SIGNALS,
  PIO_PASSIVE_SIGNALS,
  PIO_STEP_ORDER,
  pioSignalInitial,
} from '../../constants/pioSignals'
import { computePioMeasures, pioTransactionDuration } from '../../utils/pioMeasure'

const LABEL_W = 92
const PLOT_X = LABEL_W + 8
const PLOT_W = 860
const VIEW_W = PLOT_X + PLOT_W + 8
const ROW_H = 26
const GROUP_GAP = 14
const AXIS_H = 26
const TOP_PAD = 20

const ACTIVE_ROWS = PIO_ACTIVE_SIGNALS.filter((s) => !s.reserved)
const PASSIVE_ROWS = PIO_PASSIVE_SIGNALS.filter((s) => !s.reserved)

const STEP_SHORT: Record<string, string> = {
  T1_VALID_REQ: 'T1',
  T2_REQ_TRREQ: 'T2',
  T3_TRREQ_READY: 'T3',
  T4_READY_BUSY: 'T4',
  T5_BUSY_CARRIER: 'T5',
  T6_CARRIER_COMPT: 'T6',
  T7_COMPT_CLOSE: 'T7',
}

/** 신호 파형 polyline 포인트 생성 (엣지 → 계단 파형) */
function waveformPoints(
  edges: PioEdge[],
  signal: string,
  clipMs: number,
  toX: (t: number) => number,
  yHigh: number,
  yLow: number,
): string {
  const own = edges
    .filter((e) => e.signal === signal && e.t <= clipMs)
    .sort((a, b) => a.t - b.t)
  let level: 0 | 1 = pioSignalInitial(signal)
  let y = level === 1 ? yHigh : yLow
  const pts: string[] = [`${toX(0)},${y}`]
  for (const e of own) {
    if (e.value === level) continue
    const x = toX(e.t)
    pts.push(`${x},${y}`)
    level = e.value
    y = level === 1 ? yHigh : yLow
    pts.push(`${x},${y}`)
  }
  pts.push(`${toX(clipMs)},${y}`)
  return pts.join(' ')
}

function tickStep(totalMs: number): number {
  const candidates = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]
  for (const c of candidates) {
    if (totalMs / c <= 9) return c
  }
  return 20000
}

export function PioTimeChart({
  transaction,
  baseline,
  cursorMs,
}: {
  transaction: PioTransaction
  baseline: PioBaseline
  /** null이면 전체 표시 · 값이 있으면 해당 시각까지만 (라이브/리플레이) */
  cursorMs: number | null
}) {
  const tx = transaction

  const baselineSchedule = useMemo(
    () => buildPioSchedule(tx.operation, baseline.steps),
    [tx.operation, baseline.steps],
  )
  const measures = useMemo(() => computePioMeasures(tx, baseline), [tx, baseline])

  const txDuration = pioTransactionDuration(tx)
  const baselineTotal = PIO_STEP_ORDER.reduce((s, id) => s + baseline.steps[id], 0)
  const totalMs = Math.max(txDuration, baselineTotal, cursorMs ?? 0, 100) * 1.06

  const toX = (t: number) => PLOT_X + (t / totalMs) * PLOT_W

  const rows = [...ACTIVE_ROWS, ...PASSIVE_ROWS]
  const rowY = (idx: number) =>
    TOP_PAD + idx * ROW_H + (idx >= ACTIVE_ROWS.length ? GROUP_GAP : 0)
  const plotH = rowY(rows.length - 1) + ROW_H
  const viewH = plotH + AXIS_H

  const clipMs = cursorMs != null ? Math.min(cursorMs, totalMs) : totalMs
  const step = tickStep(totalMs)
  const ticks: number[] = []
  for (let t = 0; t <= totalMs; t += step) ticks.push(t)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${viewH}`}
      width="100%"
      className="select-none"
      role="img"
      aria-label="PIO 타임차트"
    >
      {/* ── 이상 구간 하이라이트 (기준 초과 스텝) ── */}
      {measures.map((m) => {
        if ((m.status !== 'over' && m.status !== 'warn') || m.fromMs == null || m.toMs == null)
          return null
        const x1 = toX(Math.min(m.fromMs, clipMs))
        const x2 = toX(Math.min(m.toMs, clipMs))
        if (x2 <= x1) return null
        const over = m.status === 'over'
        return (
          <g key={`band-${m.step}`}>
            <rect
              x={x1}
              y={TOP_PAD - 6}
              width={x2 - x1}
              height={plotH - TOP_PAD + 10}
              fill={over ? 'rgba(239,68,68,0.13)' : 'rgba(251,191,36,0.09)'}
              stroke={over ? 'rgba(239,68,68,0.45)' : 'rgba(251,191,36,0.35)'}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={(x1 + x2) / 2}
              y={TOP_PAD - 9}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              fill={over ? '#f87171' : '#fbbf24'}
            >
              {STEP_SHORT[m.step]} +{m.deviationMs}ms
            </text>
          </g>
        )
      })}

      {/* ── 신호 행 ── */}
      {rows.map((sig, idx) => {
        const y = rowY(idx)
        const yHigh = y + 4
        const yLow = y + ROW_H - 8
        const isActive = sig.side === 'active'
        const color = isActive ? '#22d3ee' : '#a78bfa'

        return (
          <g key={sig.name}>
            {/* 행 배경 라인 */}
            <line
              x1={PLOT_X}
              y1={yLow}
              x2={PLOT_X + PLOT_W}
              y2={yLow}
              stroke="rgba(51,65,85,0.5)"
              strokeWidth={0.5}
            />
            {/* 라벨 */}
            <text
              x={LABEL_W}
              y={y + ROW_H / 2 + 1}
              textAnchor="end"
              fontSize={10.5}
              fontWeight={600}
              fill={color}
            >
              {sig.name}
            </text>
            {/* 골든 베이스라인 고스트 (점선) */}
            <polyline
              points={waveformPoints(baselineSchedule, sig.name, totalMs, toX, yHigh, yLow)}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.4}
            />
            {/* 현재 신호 파형 */}
            <polyline
              points={waveformPoints(tx.edges, sig.name, clipMs, toX, yHigh, yLow)}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              strokeLinejoin="miter"
            />
          </g>
        )
      })}

      {/* ── 그룹 라벨 ── */}
      <text x={4} y={rowY(0) - 6} fontSize={9} fontWeight={700} fill="#22d3ee" opacity={0.85}>
        ACTIVE ({tx.activeName})
      </text>
      <text
        x={4}
        y={rowY(ACTIVE_ROWS.length) - 6}
        fontSize={9}
        fontWeight={700}
        fill="#a78bfa"
        opacity={0.85}
      >
        PASSIVE ({tx.passiveName})
      </text>

      {/* ── 시간 축 ── */}
      {ticks.map((t) => (
        <g key={`tick-${t}`}>
          <line
            x1={toX(t)}
            y1={TOP_PAD - 6}
            x2={toX(t)}
            y2={plotH}
            stroke="rgba(51,65,85,0.4)"
            strokeWidth={0.5}
          />
          <text
            x={toX(t)}
            y={plotH + 14}
            textAnchor="middle"
            fontSize={9}
            fill="#64748b"
          >
            {t >= 1000 ? `${(t / 1000).toFixed(t % 1000 === 0 ? 0 : 1)}s` : `${t}ms`}
          </text>
        </g>
      ))}

      {/* ── 커서 (라이브/리플레이) ── */}
      {cursorMs != null && (
        <g>
          <line
            x1={toX(clipMs)}
            y1={TOP_PAD - 10}
            x2={toX(clipMs)}
            y2={plotH}
            stroke="#f0abfc"
            strokeWidth={1.5}
          />
          <text
            x={toX(clipMs)}
            y={plotH + 24}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill="#f0abfc"
          >
            {Math.round(clipMs)}ms
          </text>
        </g>
      )}
    </svg>
  )
}
