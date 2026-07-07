import { useMemo } from 'react'
import type { PioBaseline, PioEdge, PioSide, PioTransaction } from '../../types/pio'
import {
  buildScheduleForPair,
  pioSignalInitial,
  pioSignalSetForPair,
} from '../../constants/pioSignals'
import { computePioMeasures, pioTransactionDuration } from '../../utils/pioMeasure'

const LABEL_W = 92
const PLOT_X = LABEL_W + 8
const PLOT_W = 860
const VIEW_W = PLOT_X + PLOT_W + 8
const ROW_H = 26
// Active/Passive 헤더가 이름·모듈 타입 2줄이라 그룹 앞 여백을 넉넉히 확보
const GROUP_GAP = 28
const AXIS_H = 26
const TOP_PAD = 32

/** 단계 라벨 앞에 붙일 짧은 태그 (이상 구간 표시용) — 순번 기반 */
function shortStepTag(index: number): string {
  return `S${index + 1}`
}

/** 신호 파형 polyline 포인트 생성 (엣지 → 계단 파형). side로 동명 신호(BUSY 등) 구분 */
function waveformPoints(
  edges: PioEdge[],
  signal: string,
  side: PioSide,
  initial: 0 | 1,
  clipMs: number,
  toX: (t: number) => number,
  yHigh: number,
  yLow: number,
): string {
  const own = edges
    .filter((e) => e.signal === signal && e.side === side && e.t <= clipMs)
    .sort((a, b) => a.t - b.t)
  let level: 0 | 1 = initial
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
  const { active: activeSignals, passive: passiveSignals } = pioSignalSetForPair(tx.pairKind)
  const rows = useMemo(
    () => [
      ...activeSignals.filter((s) => !s.reserved),
      ...passiveSignals.filter((s) => !s.reserved),
    ],
    [activeSignals, passiveSignals],
  )
  const activeRowCount = activeSignals.filter((s) => !s.reserved).length

  const baselineSchedule = useMemo(
    () => buildScheduleForPair(tx.pairKind, tx.operation, baseline.steps),
    [tx.pairKind, tx.operation, baseline.steps],
  )
  const measures = useMemo(() => computePioMeasures(tx, baseline), [tx, baseline])

  const txDuration = pioTransactionDuration(tx)
  const baselineTotal = baseline.stepOrder.reduce((s, id) => s + (baseline.steps[id] ?? 0), 0)
  const totalMs = Math.max(txDuration, baselineTotal, cursorMs ?? 0, 100) * 1.06

  const toX = (t: number) => PLOT_X + (t / totalMs) * PLOT_W

  const rowY = (idx: number) => TOP_PAD + idx * ROW_H + (idx >= activeRowCount ? GROUP_GAP : 0)
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
      {measures.map((m, idx) => {
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
              {shortStepTag(idx)} +{m.deviationMs}ms
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
        const initial = pioSignalInitial(tx.pairKind, sig.name)

        return (
          <g key={`${sig.side}-${sig.name}`}>
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
              points={waveformPoints(
                baselineSchedule,
                sig.name,
                sig.side,
                initial,
                totalMs,
                toX,
                yHigh,
                yLow,
              )}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.4}
            />
            {/* 현재 신호 파형 */}
            <polyline
              points={waveformPoints(
                tx.edges,
                sig.name,
                sig.side,
                initial,
                clipMs,
                toX,
                yHigh,
                yLow,
              )}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              strokeLinejoin="miter"
            />
          </g>
        )
      })}

      {/* ── 그룹 라벨 (이름 + 모듈 타입 2줄) ── */}
      <text x={4} y={rowY(0) - 19} fontSize={9} fontWeight={700} fill="#22d3ee" opacity={0.85}>
        ACTIVE ({tx.activeName})
      </text>
      {tx.activeType && (
        <text x={4} y={rowY(0) - 8} fontSize={8} fill="#67e8f9" opacity={0.65}>
          {tx.activeType}
        </text>
      )}
      <text
        x={4}
        y={rowY(activeRowCount) - 19}
        fontSize={9}
        fontWeight={700}
        fill="#a78bfa"
        opacity={0.85}
      >
        PASSIVE ({tx.passiveName})
      </text>
      {tx.passiveType && (
        <text x={4} y={rowY(activeRowCount) - 8} fontSize={8} fill="#c4b5fd" opacity={0.65}>
          {tx.passiveType}
        </text>
      )}

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
